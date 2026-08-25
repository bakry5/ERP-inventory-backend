const express = require('express');
const warehouseController = require('../controllers/warehouseController');
const stockController = require('../controllers/stockController');
const { protect, allowedTo } = require('../middlewares/authMiddleware');
const {
  createWarehouseValidator,
  updateWarehouseValidator,
  warehouseIdValidator,
  listWarehousesValidator,
} = require('../validators/warehouseValidator');

const router = express.Router();

router.use(protect);

// Reading warehouses is fine for any authenticated role (staff need to see
// where stock lives too) — only mutating them is admin-restricted.
router.get('/', listWarehousesValidator, warehouseController.getAllWarehouses);
router.get('/:id', warehouseIdValidator, warehouseController.getWarehouse);
router.get('/:id/stock', warehouseIdValidator, stockController.getWarehouseStock);

router.post(
  '/',
  allowedTo('SUPER_ADMIN', 'ADMIN'),
  createWarehouseValidator,
  warehouseController.createWarehouse
);

router.patch(
  '/:id',
  allowedTo('SUPER_ADMIN', 'ADMIN'),
  updateWarehouseValidator,
  warehouseController.updateWarehouse
);

router.delete(
  '/:id',
  allowedTo('SUPER_ADMIN'),
  warehouseIdValidator,
  warehouseController.deleteWarehouse
);

module.exports = router;
