const asyncHandler = require("express-async-handler");
const prisma = require("../config/database");
const ApiError = require("../utils/apiError");
const { verifyAccessToken } = require("../utils/tokens");

exports.protect = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.accessToken;

  if (!token) {
    return next(
      new ApiError("You are not logged in, please login to get access", 401),
    );
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    return next(err);
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: decoded.userId },
  });

  if (!currentUser) {
    return next(
      new ApiError("The user belonging to this token no longer exists", 401),
    );
  }

  if (!currentUser.isActive) {
    return next(new ApiError("This account has been deactivated", 403));
  }

  if (currentUser.tokenVersion !== decoded.tokenVersion) {
    return next(
      new ApiError(
        "Session expired due to a security event, please login again",
        401,
      ),
    );
  }

  req.user = currentUser;
  next();
});

exports.requireEmailVerified = (req, res, next) => {
  if (!req.user.isEmailVerified) {
    return next(
      new ApiError(
        "Please verify your email before performing this action",
        403,
      ),
    );
  }
  next();
};

exports.allowedTo =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new ApiError("You are not allowed to access this route", 403),
      );
    }
    next();
  };
