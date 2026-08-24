const express = require('express');
const orderController = require('../controllers/orderController');
const { protect, requireEmailVerified, allowedTo } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/my-orders', orderController.getMyOrders);

// Unverified users are blocked from checkout right here.
router.post('/', requireEmailVerified, orderController.createOrder);

// Fulfillment staff turn a reservation into a real stock deduction.
router.patch(
  '/:id/confirm',
  allowedTo('SUPER_ADMIN', 'ADMIN', 'WAREHOUSE_MANAGER'),
  orderController.confirmOrder
);

// The order owner or staff can cancel a still-pending order (releases the
// reservation, no stock ever left the warehouse for a PENDING order).
router.patch('/:id/cancel', orderController.cancelOrder);

module.exports = router;
