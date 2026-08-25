const express = require('express');
const userController = require('../controllers/userController');
const { protect, allowedTo } = require('../middlewares/authMiddleware');
const {
  listUsersValidator,
  userIdValidator,
  updateUserRoleValidator,
} = require('../validators/userValidator');

const router = express.Router();

router.use(protect, allowedTo('SUPER_ADMIN', 'ADMIN'));

router.get('/', listUsersValidator, userController.getAllUsers);
router.get('/:id', userIdValidator, userController.getUser);

router.patch('/:id/deactivate', userIdValidator, userController.deactivateUser);
router.patch('/:id/reactivate', userIdValidator, userController.reactivateUser);

// Role changes are one notch more sensitive than everyday admin actions.
router.patch(
  '/:id/role',
  allowedTo('SUPER_ADMIN'),
  updateUserRoleValidator,
  userController.updateUserRole
);

module.exports = router;
