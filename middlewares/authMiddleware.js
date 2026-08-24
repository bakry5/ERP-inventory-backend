const asyncHandler = require('express-async-handler');
const prisma = require('../config/database');
const ApiError = require('../utils/apiError');
const { verifyAccessToken } = require('../utils/tokens');

/**
 * protect
 * - Verifies the short-lived access token from the httpOnly cookie.
 * - Loads the fresh user row and re-checks `tokenVersion` against the value
 *   baked into the JWT. If they don't match, a password reset / forced
 *   logout happened after this token was issued, so we reject it even
 *   though the JWT signature itself is still valid.
 */
exports.protect = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.accessToken;

  if (!token) {
    return next(new ApiError('You are not logged in, please login to get access', 401));
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    // Let the global error handler translate JsonWebTokenError / TokenExpiredError
    return next(err);
  }

  const currentUser = await prisma.user.findUnique({ where: { id: decoded.userId } });

  if (!currentUser) {
    return next(new ApiError('The user belonging to this token no longer exists', 401));
  }

  if (!currentUser.isActive) {
    return next(new ApiError('This account has been deactivated', 403));
  }

  if (currentUser.tokenVersion !== decoded.tokenVersion) {
    return next(
      new ApiError('Session expired due to a security event, please login again', 401)
    );
  }

  req.user = currentUser;
  next();
});

/**
 * requireEmailVerified
 * - Guards routes like checkout/order-creation that must not be reachable
 *   by an account that hasn't confirmed its email OTP yet.
 */
exports.requireEmailVerified = (req, res, next) => {
  if (!req.user.isEmailVerified) {
    return next(new ApiError('Please verify your email before performing this action', 403));
  }
  next();
};

/**
 * allowedTo(...roles) — simple RBAC gate.
 */
exports.allowedTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new ApiError('You are not allowed to access this route', 403));
  }
  next();
};
