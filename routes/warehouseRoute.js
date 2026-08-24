const express = require("express");
const warehouseController = require("../controllers/warehouseController");
const { protect, allowedTo } = require("../middlewares/authMiddleware");
const {
  createWarehouseValidator,
  updateWarehouseValidator,
  warehouseIdValidator,
} = require("../validators/warehouseValidator");

const router = express.Router();

router.use(protect);

router.get("/", warehouseController.getAllWarehouses);
router.get("/:id", warehouseIdValidator, warehouseController.getWarehouse);

router.post(
  "/",
  allowedTo("SUPER_ADMIN", "ADMIN"),
  createWarehouseValidator,
  warehouseController.createWarehouse,
);

router.patch(
  "/:id",
  allowedTo("SUPER_ADMIN", "ADMIN"),
  updateWarehouseValidator,
  warehouseController.updateWarehouse,
);

router.delete(
  "/:id",
  allowedTo("SUPER_ADMIN"),
  warehouseIdValidator,
  warehouseController.deleteWarehouse,
);

module.exports = router;
