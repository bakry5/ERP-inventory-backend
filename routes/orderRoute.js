const express = require('express');
const orderController = require('../controllers/orderController');
const { protect, requireEmailVerified, allowedTo } = require('../middlewares/authMiddleware');
const { createOrderValidator, listOrdersValidator } = require('../validators/orderValidator');

const router = express.Router();

router.use(protect);

router.get('/my-orders', listOrdersValidator, orderController.getMyOrders);

// Staff-only: every order in the system, not just the caller's own.
router.get(
  '/',
  allowedTo('SUPER_ADMIN', 'ADMIN', 'WAREHOUSE_MANAGER'),
  listOrdersValidator,
  orderController.getAllOrders
);

// Unverified users are blocked from checkout right here.
router.post('/', requireEmailVerified, createOrderValidator, orderController.createOrder);

// Owner or staff — getOrder itself enforces this at the controller level
// since "owner" isn't knowable from the route alone.
router.get('/:id', orderController.getOrder);

// Fulfillment staff turn a reservation into a real stock deduction.
router.patch(
  '/:id/confirm',
  allowedTo('SUPER_ADMIN', 'ADMIN', 'WAREHOUSE_MANAGER'),
  orderController.confirmOrder
);

// The order owner or staff can cancel a still-pending order (releases the
// reservation, no stock ever left the warehouse for a PENDING order).
router.patch('/:id/cancel', orderController.cancelOrder);

// Shipping lifecycle — staff-only, no stock impact (already deducted at confirm).
router.patch(
  '/:id/ship',
  allowedTo('SUPER_ADMIN', 'ADMIN', 'WAREHOUSE_MANAGER'),
  orderController.shipOrder
);
router.patch(
  '/:id/deliver',
  allowedTo('SUPER_ADMIN', 'ADMIN', 'WAREHOUSE_MANAGER'),
  orderController.deliverOrder
);
router.patch(
  '/:id/refund',
  allowedTo('SUPER_ADMIN', 'ADMIN'),
  orderController.refundOrder
);

module.exports = router;
