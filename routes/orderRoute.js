const express = require("express");
const orderController = require("../controllers/orderController");
const {
  protect,
  requireEmailVerified,
} = require("../middlewares/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/my-orders", orderController.getMyOrders);

router.post("/", requireEmailVerified, orderController.createOrder);

module.exports = router;
