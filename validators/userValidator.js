const { body, param, query } = require('express-validator');
const validatorMiddleware = require('../middlewares/validatorMiddleware');

exports.listUsersValidator = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('role').optional().isIn([
    'SUPER_ADMIN',
    'ADMIN',
    'WAREHOUSE_MANAGER',
    'STAFF',
    'CUSTOMER',
  ]),
  validatorMiddleware,
];

exports.userIdValidator = [
  param('id').isUUID().withMessage('Invalid user id'),
  validatorMiddleware,
];

exports.updateUserRoleValidator = [
  param('id').isUUID().withMessage('Invalid user id'),
  body('role')
    .isIn(['SUPER_ADMIN', 'ADMIN', 'WAREHOUSE_MANAGER', 'STAFF', 'CUSTOMER'])
    .withMessage('Invalid role'),
  validatorMiddleware,
];
