export const authTokenKey = 'pais_auth_token';
export const legacyAuthTokenKey = 'pcms_auth_token';

const installationKey = Symbol.for('pams.axiosSessionRefresh');
const sessionExpiredMessage = 'Your session has expired. Please sign in again. Your form entries have been kept.';
const publicAuthRoute = /^\/auth\/(?:login|logout|forgot-password|reset-password|refresh)(?:\/|$)/;

const authorization = (config) => config.headers?.get?.('Authorization') ?? config.headers?.Authorization;

const setRequestToken = (config, token) => {
  if (config.headers?.set) config.headers.set('Authorization', token ? `Bearer ${token}` : null);
  else config.headers = { ...config.headers, Authorization: token ? `Bearer ${token}` : null };
};

const expiredError = (original) => {
  const error = new Error(sessionExpiredMessage, { cause: original });
  error.code = 'SESSION_EXPIRED';
  error.config = original?.config;
  error.response = {
    ...original?.response,
    status: 401,
    data: { ...original?.response?.data, success: false, message: sessionExpiredMessage },
  };
  return error;
};

// Keep recovery independent of React so a failed session does not unmount an unsaved form.
export const installSessionRefresh = (client, { storage } = {}) => {
  client[installationKey]?.dispose();
  let version = 0;
  let refreshAllowed = true;
  let refreshPromise = null;
  let token = storage?.getItem(authTokenKey) || storage?.getItem(legacyAuthTokenKey) || null;

  const writeToken = (nextToken) => {
    token = nextToken || null;
    if (token) {
      storage?.setItem(authTokenKey, token);
      client.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
      storage?.removeItem(authTokenKey);
      delete client.defaults.headers.common.Authorization;
    }
    storage?.removeItem(legacyAuthTokenKey);
  };
  writeToken(token);

  const protectedRequest = (config) => {
    if (!config || config._pamsSkipRefresh) return false;
    let path = config.url || '';
    if (/^(?:https?:)?\/\//i.test(path)) {
      try {
        const base = new URL(config.baseURL || client.defaults.baseURL);
        const target = new URL(path, base);
        const prefix = base.pathname.replace(/\/$/, '');
        if (target.origin !== base.origin || (prefix && !target.pathname.startsWith(`${prefix}/`))) return false;
        path = target.pathname.slice(prefix.length);
      } catch {
        return false;
      }
    }
    path = `/${path.replace(/^\/+/, '').split('?')[0]}`;
    return !publicAuthRoute.test(path);
  };

  const requestId = client.interceptors.request.use((config) => {
    if (protectedRequest(config) && config._pamsSessionVersion === undefined) {
      config._pamsSessionVersion = version;
    }
    return config;
  });

  const refresh = () => {
    if (refreshPromise) return refreshPromise;
    const startedVersion = version;
    const pending = client.post('/auth/refresh', null, {
      _pamsSkipRefresh: true,
      headers: { Authorization: null },
      timeout: 15000,
    }).then(({ data }) => {
      const accessToken = data.data?.accessToken;
      if (startedVersion !== version || !refreshAllowed || !accessToken) throw expiredError();
      writeToken(accessToken);
      return accessToken;
    }).catch((error) => {
      if (startedVersion === version) {
        refreshAllowed = false;
        writeToken(null);
      }
      throw error;
    }).finally(() => {
      if (refreshPromise === pending) refreshPromise = null;
    });
    refreshPromise = pending;
    return pending;
  };

  const responseId = client.interceptors.response.use(undefined, async (error) => {
    const config = error.config;
    if (error.response?.status !== 401 || !protectedRequest(config)) throw error;
    if (config._pamsSessionRetry || config._pamsSessionVersion !== version || !refreshAllowed) {
      throw expiredError(error);
    }

    let recoveredToken;
    try {
      // A delayed 401 may belong to the token that another request already replaced.
      recoveredToken = token && authorization(config) !== `Bearer ${token}` ? token : await refresh();
    } catch {
      throw expiredError(error);
    }
    if (config._pamsSessionVersion !== version || !refreshAllowed) throw expiredError(error);
    config._pamsSessionRetry = true;
    setRequestToken(config, recoveredToken);
    return client.request(config);
  });

  const session = {
    setToken(nextToken) {
      version += 1;
      refreshAllowed = true;
      writeToken(nextToken);
    },
    clearToken() {
      version += 1;
      refreshAllowed = false;
      writeToken(null);
    },
    beginLogout() {
      version += 1;
      refreshAllowed = false;
      // Let a pending refresh response finish before logout clears the browser cookies.
      return refreshPromise?.catch(() => {});
    },
    dispose() {
      version += 1;
      refreshAllowed = false;
      client.interceptors.request.eject(requestId);
      client.interceptors.response.eject(responseId);
    },
  };
  client[installationKey] = session;
  return session;
};
