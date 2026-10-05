import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';

import { loadStickySignatories } from '../utils/stickySignatories';

const AuthContext = createContext(null);
axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
axios.defaults.withCredentials = true;
// Use the report route that works with the live Vercel deployment.
// The backend also retains /reports for existing clients.
axios.interceptors.request.use((config) => {
  if (config.url === '/reports' || config.url?.startsWith('/reports/')) {
    config.url = config.url.replace(/^\/reports(?=\/|$)/, '/dashboard');
  }
  return config;
});

const authTokenKey = 'pais_auth_token';
const legacyAuthTokenKey = 'pcms_auth_token';

const setAuthToken = (token) => {
  if (token) {
    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
    return;
  }

  delete axios.defaults.headers.common.Authorization;
};

const savedToken = localStorage.getItem(authTokenKey) || localStorage.getItem(legacyAuthTokenKey);
if (savedToken) {
  localStorage.setItem(authTokenKey, savedToken);
  localStorage.removeItem(legacyAuthTokenKey);
  setAuthToken(savedToken);
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { data } = await axios.get('/auth/me');
        if (data.data?.user?.role === 'admin') await loadStickySignatories().catch(() => {});
        setUser(data.data?.user || null);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
        setAuthReady(true);
      }
    };
    fetchUser();
  }, []);

  const login = async (identifier, password, rememberMe) => {
    const { data } = await axios.post('/auth/login', { identifier, password, rememberMe });
    const accessToken = data.data?.accessToken;

    if (accessToken) {
      localStorage.setItem(authTokenKey, accessToken);
      setAuthToken(accessToken);
    }

    if (data.data?.user?.role === 'admin') await loadStickySignatories().catch(() => {});
    setUser(data.data?.user || null);
    toast.success(data.message || 'Welcome back');
    return data;
  };

  const logout = async () => {
    setLoggingOut(true);
    try {
      await axios.post('/auth/logout');
      localStorage.removeItem(authTokenKey);
      localStorage.removeItem(legacyAuthTokenKey);
      setAuthToken(null);
      setUser(null);
      toast.success('Signed out');
    } finally {
      setLoggingOut(false);
    }
  };

  const refreshUser = async () => {
    const { data } = await axios.get('/auth/me');
    setUser(data.data?.user || null);
  };

  const value = useMemo(
    () => ({ user, loading, authReady, loggingOut, login, logout, refreshUser }),
    [user, loading, authReady, loggingOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
