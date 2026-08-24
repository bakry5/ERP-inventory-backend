const { body, param } = require('express-validator');
const validatorMiddleware = require('../middlewares/validatorMiddleware');

exports.createProductValidator = [
  body('sku').trim().notEmpty().withMessage('SKU is required'),
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('price').isFloat({ gt: 0 }).withMessage('Price must be a positive number'),
  body('description').optional().trim(),
  validatorMiddleware,
];

exports.updateProductValidator = [
  param('id').isUUID().withMessage('Invalid product id'),
  body('sku').optional().trim().notEmpty(),
  body('name').optional().trim().notEmpty(),
  body('price').optional().isFloat({ gt: 0 }),
  body('description').optional().trim(),
  body('isActive').optional().isBoolean(),
  validatorMiddleware,
];

exports.productIdValidator = [
  param('id').isUUID().withMessage('Invalid product id'),
  validatorMiddleware,
];

exports.adjustStockValidator = [
  body('productId').isUUID().withMessage('Valid productId is required'),
  body('warehouseId').isUUID().withMessage('Valid warehouseId is required'),
  body('quantity')
    .isInt()
    .withMessage('quantity must be an integer')
    .custom((val) => val !== 0)
    .withMessage('quantity cannot be 0'),
  validatorMiddleware,
];
