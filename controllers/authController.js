const bcrypt = require('bcryptjs');
const asyncHandler = require('express-async-handler');

const prisma = require('../config/database');
const redis = require('../config/redis');
const ApiError = require('../utils/apiError');
const { generateOtp, generateResetToken, hashToken } = require('../utils/otp');
const {
  setAuthCookies,
  clearAuthCookies,
  verifyRefreshToken,
} = require('../utils/tokens');
const {
  sendOtpEmail,
  sendResetPasswordEmail,
  sendPasswordChangedEmail,
} = require('../utils/email');

const OTP_TTL_SECONDS = 10 * 60; // 10 minutes
const RESET_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes

const sanitizeUser = (user) => {
  const { password, ...safeUser } = user;
  return safeUser;
};

// ------------------------------------------------------------------
// REGISTER  ->  sends a 6-digit OTP, does NOT log the user in yet.
// ------------------------------------------------------------------
exports.register = asyncHandler(async (req, res, next) => {
  const { name, email, password } = req.body;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return next(new ApiError('Email already in use', 400));
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { name, email, password: hashedPassword },
  });

  const otp = generateOtp();
  // Keyed by email (not userId) so verification can happen before we ever
  // trust a session for this account.
  await redis.set(`otp:${email}`, otp, { ex: OTP_TTL_SECONDS });

  await sendOtpEmail(email, otp);

  res.status(201).json({
    status: 'success',
    message: 'Registered successfully. Check your email for the verification code.',
    data: { user: sanitizeUser(user) },
  });
});

// ------------------------------------------------------------------
// VERIFY EMAIL OTP
// ------------------------------------------------------------------
exports.verifyOtp = asyncHandler(async (req, res, next) => {
  const { email, otp } = req.body;

  const storedOtp = await redis.get(`otp:${email}`);
  if (!storedOtp) {
    return next(new ApiError('OTP has expired, please request a new one', 400));
  }

  if (String(storedOtp) !== String(otp)) {
    return next(new ApiError('Invalid verification code', 400));
  }

  const user = await prisma.user.update({
    where: { email },
    data: { isEmailVerified: true },
  });

  await redis.del(`otp:${email}`);

  const { accessToken, refreshToken } = setAuthCookies(res, user);

  res.status(200).json({
    status: 'success',
    message: 'Email verified successfully',
    data: { user: sanitizeUser(user), accessToken, refreshToken },
  });
});

// ------------------------------------------------------------------
// RESEND OTP
// ------------------------------------------------------------------
exports.resendOtp = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return next(new ApiError('No account found with this email', 404));
  }
  if (user.isEmailVerified) {
    return next(new ApiError('This email is already verified', 400));
  }

  const otp = generateOtp();
  await redis.set(`otp:${email}`, otp, { ex: OTP_TTL_SECONDS });
  await sendOtpEmail(email, otp);

  res.status(200).json({ status: 'success', message: 'A new verification code was sent' });
});

// ------------------------------------------------------------------
// LOGIN
// ------------------------------------------------------------------
exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  const isCorrectPassword = user && (await bcrypt.compare(password, user.password));

  if (!isCorrectPassword) {
    return next(new ApiError('Incorrect email or password', 401));
  }

  if (!user.isActive) {
    return next(new ApiError('This account has been deactivated', 403));
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const { accessToken, refreshToken } = setAuthCookies(res, user);

  res.status(200).json({
    status: 'success',
    data: { user: sanitizeUser(user), accessToken, refreshToken },
  });
});

// ------------------------------------------------------------------
// LOGOUT  ->  clears cookies for THIS device only (tokenVersion is
// untouched, so other devices stay logged in — use resetPassword's
// full invalidation for the "kick every device" case).
// ------------------------------------------------------------------
exports.logout = asyncHandler(async (req, res) => {
  clearAuthCookies(res);
  res.status(200).json({ status: 'success', message: 'Logged out successfully' });
});

// ------------------------------------------------------------------
// REFRESH TOKEN
// ------------------------------------------------------------------
exports.refreshToken = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.refreshToken;
  if (!token) {
    return next(new ApiError('No refresh token provided, please login again', 401));
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch (err) {
    return next(err);
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
  if (!user) {
    return next(new ApiError('The user belonging to this token no longer exists', 401));
  }

  // The core of session invalidation: if tokenVersion in the DB moved on
  // (password reset happened after this refresh token was issued), reject it.
  if (user.tokenVersion !== decoded.tokenVersion) {
    clearAuthCookies(res);
    return next(new ApiError('Session expired, please login again', 401));
  }

  const { accessToken, refreshToken } = setAuthCookies(res, user);

  res.status(200).json({ status: 'success', data: { accessToken, refreshToken } });
});

// ------------------------------------------------------------------
// FORGOT PASSWORD  ->  emails a one-time reset link.
// ------------------------------------------------------------------
exports.forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  // Respond 200 either way to avoid leaking which emails are registered.
  if (!user) {
    return res.status(200).json({
      status: 'success',
      message: 'If that email exists, a reset link has been sent',
    });
  }

  const rawResetToken = generateResetToken();
  const hashedResetToken = hashToken(rawResetToken);

  // Store only the hash, keyed by hash -> userId, so a Redis leak alone
  // can't be used to reset anyone's password.
  await redis.set(`pwreset:${hashedResetToken}`, user.id, { ex: RESET_TOKEN_TTL_SECONDS });

  const resetUrl = `${process.env.CLIENT_URL}/reset-password/${rawResetToken}`;
  await sendResetPasswordEmail(user.email, resetUrl);

  res.status(200).json({
    status: 'success',
    message: 'If that email exists, a reset link has been sent',
  });
});

// ------------------------------------------------------------------
// RESET PASSWORD  ->  updates password, bumps tokenVersion, wipes cookies.
// This single tokenVersion increment invalidates EVERY refresh token
// (and access token) already issued for this user, on every device,
// without needing to enumerate or store individual session records.
// ------------------------------------------------------------------
exports.resetPassword = asyncHandler(async (req, res, next) => {
  const { token } = req.params;
  const { password } = req.body;

  const hashedToken = hashToken(token);
  const userId = await redis.get(`pwreset:${hashedToken}`);

  if (!userId) {
    return next(new ApiError('Invalid or expired reset token', 400));
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      password: hashedPassword,
      tokenVersion: { increment: 1 },
    },
  });

  // One-time use — burn the token immediately so it can't be replayed.
  await redis.del(`pwreset:${hashedToken}`);

  // Clear cookies on THIS device explicitly; other devices' cookies simply
  // become useless the next time their tokenVersion is checked.
  clearAuthCookies(res);

  await sendPasswordChangedEmail(user.email);

  res.status(200).json({
    status: 'success',
    message: 'Password reset successful. Please login again on all your devices.',
  });
});

// ------------------------------------------------------------------
// GET ME
// ------------------------------------------------------------------
exports.getMe = asyncHandler(async (req, res) => {
  res.status(200).json({ status: 'success', data: { user: sanitizeUser(req.user) } });
});
