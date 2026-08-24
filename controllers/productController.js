const asyncHandler = require("express-async-handler");
const prisma = require("../config/database");
const ApiError = require("../utils/apiError");
const { logAction } = require("../services/auditLogService");

exports.getAllProducts = asyncHandler(async (req, res) => {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });
  res
    .status(200)
    .json({ status: "success", results: products.length, data: { products } });
});

exports.getProduct = asyncHandler(async (req, res, next) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: { stocks: { include: { warehouse: true } } },
  });
  if (!product) {
    return next(new ApiError("Product not found", 404));
  }
  res.status(200).json({ status: "success", data: { product } });
});

exports.createProduct = asyncHandler(async (req, res, next) => {
  const { sku, name, description, price } = req.body;

  const existing = await prisma.product.findUnique({ where: { sku } });
  if (existing) {
    return next(new ApiError("A product with this SKU already exists", 400));
  }

  const product = await prisma.product.create({
    data: { sku, name, description, price },
  });

  logAction({
    userId: req.user.id,
    action: "CREATE",
    entityType: "Product",
    entityId: product.id,
    req,
  });

  res.status(201).json({ status: "success", data: { product } });
});

exports.updateProduct = asyncHandler(async (req, res, next) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
  });
  if (!product) {
    return next(new ApiError("Product not found", 404));
  }

  const updated = await prisma.product.update({
    where: { id: req.params.id },
    data: req.body,
  });

  logAction({
    userId: req.user.id,
    action: "UPDATE",
    entityType: "Product",
    entityId: updated.id,
    req,
  });

  res.status(200).json({ status: "success", data: { product: updated } });
});

exports.deleteProduct = asyncHandler(async (req, res, next) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
  });
  if (!product) {
    return next(new ApiError("Product not found", 404));
  }

  await prisma.product.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });

  logAction({
    userId: req.user.id,
    action: "DELETE",
    entityType: "Product",
    entityId: req.params.id,
    req,
  });

  res.status(204).json({ status: "success", data: null });
});

exports.adjustStock = asyncHandler(async (req, res, next) => {
  const { productId, warehouseId, quantity } = req.body;

  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product) throw new ApiError("Product not found", 404);

    const warehouse = await tx.warehouse.findUnique({
      where: { id: warehouseId },
    });
    if (!warehouse) throw new ApiError("Warehouse not found", 404);

    const existingLocked = await tx.$queryRaw`
      SELECT id, quantity FROM stocks
      WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
      FOR UPDATE
    `;

    let stock;
    if (existingLocked[0]) {
      const newQuantity = existingLocked[0].quantity + quantity;
      if (newQuantity < 0) {
        throw new ApiError("Adjustment would result in negative stock", 400);
      }
      stock = await tx.stock.update({
        where: { id: existingLocked[0].id },
        data: { quantity: newQuantity },
      });
    } else {
      if (quantity < 0) {
        throw new ApiError("Cannot remove stock that does not exist yet", 400);
      }
      stock = await tx.stock.create({
        data: { productId, warehouseId, quantity },
      });
    }

    return stock;
  });

  logAction({
    userId: req.user.id,
    action: quantity > 0 ? "STOCK_IN" : "STOCK_OUT",
    entityType: "Stock",
    entityId: result.id,
    metadata: { productId, warehouseId, quantity },
    req,
  });

  res.status(200).json({ status: "success", data: { stock: result } });
});
