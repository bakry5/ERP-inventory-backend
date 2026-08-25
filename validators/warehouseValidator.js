const { body, param, query } = require('express-validator');
const validatorMiddleware = require('../middlewares/validatorMiddleware');

exports.listWarehousesValidator = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validatorMiddleware,
];

exports.createWarehouseValidator = [
  body('name').trim().notEmpty().withMessage('Warehouse name is required'),
  body('code').trim().notEmpty().withMessage('Warehouse code is required'),
  body('address').optional().trim(),
  validatorMiddleware,
];

exports.updateWarehouseValidator = [
  param('id').isUUID().withMessage('Invalid warehouse id'),
  body('name').optional().trim().notEmpty(),
  body('code').optional().trim().notEmpty(),
  body('address').optional().trim(),
  body('isActive').optional().isBoolean(),
  validatorMiddleware,
];

exports.warehouseIdValidator = [
  param('id').isUUID().withMessage('Invalid warehouse id'),
  validatorMiddleware,
];
