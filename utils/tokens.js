const jwt = require('jsonwebtoken');

const isDeployed = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

// Short-lived — sent on every request. Carries `tokenVersion` too so that a
// forced logout (password reset) invalidates access tokens immediately,
// instead of waiting up to 15 minutes for natural expiry.
const generateAccessToken = (user) =>
  jwt.sign(
    { userId: user.id, role: user.role, tokenVersion: user.tokenVersion },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRE || '15m' }
  );

// Long-lived — carries `tokenVersion`. Bumping the user's tokenVersion in
// PostgreSQL instantly invalidates every refresh token already issued
// (on any device), because the version embedded in the old JWTs will no
// longer match the row in the DB, even though the JWT signature is still valid.
const generateRefreshToken = (user) =>
  jwt.sign({ userId: user.id, tokenVersion: user.tokenVersion }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d',
  });

const verifyAccessToken = (token) => jwt.verify(token, process.env.JWT_ACCESS_SECRET);
const verifyRefreshToken = (token) => jwt.verify(token, process.env.JWT_REFRESH_SECRET);

const accessCookieOptions = {
  httpOnly: true,
  secure: isDeployed,
  sameSite: isDeployed ? 'none' : 'lax',
  maxAge: 15 * 60 * 1000, // 15 min
};

const refreshCookieOptions = {
  httpOnly: true,
  secure: isDeployed,
  sameSite: isDeployed ? 'none' : 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/api/v1/auth/refresh-token', // scope the cookie to the refresh endpoint only
};

const setAuthCookies = (res, user) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  res.cookie('accessToken', accessToken, accessCookieOptions);
  res.cookie('refreshToken', refreshToken, refreshCookieOptions);

  return { accessToken, refreshToken };
};

const clearAuthCookies = (res) => {
  const { maxAge: _a, ...accessClear } = accessCookieOptions;
  const { maxAge: _r, ...refreshClear } = refreshCookieOptions;
  res.clearCookie('accessToken', accessClear);
  res.clearCookie('refreshToken', refreshClear);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,
  accessCookieOptions,
  refreshCookieOptions,
};
