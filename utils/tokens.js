const jwt = require("jsonwebtoken");

const isDeployed =
  process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

const generateAccessToken = (user) =>
  jwt.sign(
    { userId: user.id, role: user.role, tokenVersion: user.tokenVersion },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRE || "15m" },
  );

const generateRefreshToken = (user) =>
  jwt.sign(
    { userId: user.id, tokenVersion: user.tokenVersion },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRE || "30d",
    },
  );

const verifyAccessToken = (token) =>
  jwt.verify(token, process.env.JWT_ACCESS_SECRET);
const verifyRefreshToken = (token) =>
  jwt.verify(token, process.env.JWT_REFRESH_SECRET);

const accessCookieOptions = {
  httpOnly: true,
  secure: isDeployed,
  sameSite: isDeployed ? "none" : "lax",
  maxAge: 15 * 60 * 1000, // 15 min
};

const refreshCookieOptions = {
  httpOnly: true,
  secure: isDeployed,
  sameSite: isDeployed ? "none" : "lax",
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: "/api/v1/auth/refresh-token", // scope the cookie to the refresh endpoint only
};

const setAuthCookies = (res, user) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  res.cookie("accessToken", accessToken, accessCookieOptions);
  res.cookie("refreshToken", refreshToken, refreshCookieOptions);

  return { accessToken, refreshToken };
};

const clearAuthCookies = (res) => {
  const { maxAge: _a, ...accessClear } = accessCookieOptions;
  const { maxAge: _r, ...refreshClear } = refreshCookieOptions;
  res.clearCookie("accessToken", accessClear);
  res.clearCookie("refreshToken", refreshClear);
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
