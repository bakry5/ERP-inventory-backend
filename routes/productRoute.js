const express = require("express");
const productController = require("../controllers/productController");
const { protect, allowedTo } = require("../middlewares/authMiddleware");
const {
  createProductValidator,
  updateProductValidator,
  productIdValidator,
  adjustStockValidator,
} = require("../validators/productValidator");

const router = express.Router();

router.use(protect);

router.get("/", productController.getAllProducts);
router.get("/:id", productIdValidator, productController.getProduct);

router.post(
  "/",
  allowedTo("SUPER_ADMIN", "ADMIN"),
  createProductValidator,
  productController.createProduct,
);

router.patch(
  "/:id",
  allowedTo("SUPER_ADMIN", "ADMIN"),
  updateProductValidator,
  productController.updateProduct,
);

router.delete(
  "/:id",
  allowedTo("SUPER_ADMIN"),
  productIdValidator,
  productController.deleteProduct,
);

router.post(
  "/stock/adjust",
  allowedTo("SUPER_ADMIN", "ADMIN", "WAREHOUSE_MANAGER"),
  adjustStockValidator,
  productController.adjustStock,
);

module.exports = router;
