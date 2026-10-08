// A newly refreshed bearer token must take precedence over an older cookie.
// An explicitly supplied but invalid Authorization header never falls back to it.
const getAccessToken = req => {
  const authorization = req.headers.authorization;
  if (authorization !== undefined) {
    return typeof authorization === 'string' ? authorization.match(/^Bearer\s+(\S+)$/i)?.[1] : undefined;
  }
  return req.cookies?.token;
};

const isSessionUserActive = user => Boolean(user && !user.deleted && user.status === 'active' && !user.locked && !(user.lockUntil && user.lockUntil > new Date()));

module.exports = { getAccessToken, isSessionUserActive };
