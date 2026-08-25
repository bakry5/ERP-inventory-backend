const { body, query } = require('express-validator');
const validatorMiddleware = require('../middlewares/validatorMiddleware');

exports.createOrderValidator = [
  body('items').isArray({ min: 1 }).withMessage('items must be a non-empty array'),
  body('items.*.productId').isUUID().withMessage('Each item needs a valid productId'),
  body('items.*.warehouseId').isUUID().withMessage('Each item needs a valid warehouseId'),
  body('items.*.quantity')
    .isInt({ gt: 0 })
    .withMessage('Each item quantity must be a positive integer'),
  validatorMiddleware,
];

exports.listOrdersValidator = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status')
    .optional()
    .isIn([
      'PENDING',
      'PROCESSING',
      'CONFIRMED',
      'SHIPPED',
      'DELIVERED',
      'CANCELLED',
      'REFUNDED',
    ]),
  validatorMiddleware,
];
