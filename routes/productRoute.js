const express = require('express');
const productController = require('../controllers/productController');
const stockController = require('../controllers/stockController');
const { protect, allowedTo } = require('../middlewares/authMiddleware');
const {
  createProductValidator,
  updateProductValidator,
  productIdValidator,
  adjustStockValidator,
  listProductsValidator,
} = require('../validators/productValidator');

const router = express.Router();

router.use(protect);

router.get('/', listProductsValidator, productController.getAllProducts);
router.get('/:id', productIdValidator, productController.getProduct);
router.get('/:id/stock', productIdValidator, stockController.getProductStock);

router.post(
  '/',
  allowedTo('SUPER_ADMIN', 'ADMIN'),
  createProductValidator,
  productController.createProduct
);

router.patch(
  '/:id',
  allowedTo('SUPER_ADMIN', 'ADMIN'),
  updateProductValidator,
  productController.updateProduct
);

router.delete(
  '/:id',
  allowedTo('SUPER_ADMIN'),
  productIdValidator,
  productController.deleteProduct
);

// Stock-in / stock-out — a warehouse manager's day-to-day job, so it gets
// its own (slightly wider) role list than product create/delete.
router.post(
  '/stock/adjust',
  allowedTo('SUPER_ADMIN', 'ADMIN', 'WAREHOUSE_MANAGER'),
  adjustStockValidator,
  productController.adjustStock
);

module.exports = router;
