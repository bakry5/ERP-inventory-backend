const express = require('express');
const authController = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');
const createRateLimiter = require('../middlewares/rateLimiter');
const {
  registerValidator,
  loginValidator,
  verifyOtpValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  updateMeValidator,
  updatePasswordValidator,
} = require('../validators/authValidator');

const router = express.Router();

// Independent buckets per sensitive route — brute-force on login shouldn't
// also burn through the OTP or password-reset limiter, and vice versa.
const loginLimiter = createRateLimiter('ratelimit:login', 5, '15 m');
const otpLimiter = createRateLimiter('ratelimit:otp', 3, '10 m');
const forgotPasswordLimiter = createRateLimiter('ratelimit:forgot-password', 3, '15 m');

router.post('/register', registerValidator, authController.register);
router.post('/verify-otp', otpLimiter, verifyOtpValidator, authController.verifyOtp);
router.post('/resend-otp', otpLimiter, authController.resendOtp);

router.post('/login', loginLimiter, loginValidator, authController.login);
router.post('/logout', authController.logout);
router.post('/refresh-token', authController.refreshToken);

router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  forgotPasswordValidator,
  authController.forgotPassword
);
router.patch('/reset-password/:token', resetPasswordValidator, authController.resetPassword);

router.get('/me', protect, authController.getMe);
router.patch('/update-me', protect, updateMeValidator, authController.updateMe);
router.patch(
  '/update-password',
  protect,
  updatePasswordValidator,
  authController.updatePassword
);

module.exports = router;
