const { body, param } = require('express-validator');
const validatorMiddleware = require('../middlewares/validatorMiddleware');

exports.registerValidator = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/\d/)
    .withMessage('Password must contain at least one number'),
  validatorMiddleware,
];

exports.loginValidator = [
  body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  validatorMiddleware,
];

exports.verifyOtpValidator = [
  body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits').isNumeric(),
  validatorMiddleware,
];

exports.forgotPasswordValidator = [
  body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
  validatorMiddleware,
];

exports.resetPasswordValidator = [
  param('token').notEmpty().withMessage('Reset token is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/\d/)
    .withMessage('Password must contain at least one number'),
  validatorMiddleware,
];
