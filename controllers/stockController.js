const asyncHandler = require('express-async-handler');
const prisma = require('../config/database');
const ApiError = require('../utils/apiError');

// ------------------------------------------------------------------
// GET /api/v1/warehouses/:id/stock
// Every product currently stocked in one warehouse, with available
// quantity (on-hand minus what's reserved by pending orders).
// ------------------------------------------------------------------
exports.getWarehouseStock = asyncHandler(async (req, res, next) => {
  const warehouse = await prisma.warehouse.findUnique({ where: { id: req.params.id } });
  if (!warehouse) {
    return next(new ApiError('Warehouse not found', 404));
  }

  const stocks = await prisma.stock.findMany({
    where: { warehouseId: req.params.id },
    include: { product: true },
    orderBy: { product: { name: 'asc' } },
  });

  const items = stocks.map((s) => ({
    productId: s.productId,
    sku: s.product.sku,
    name: s.product.name,
    quantity: s.quantity,
    reservedQuantity: s.reservedQuantity,
    availableQuantity: s.quantity - s.reservedQuantity,
  }));

  res.status(200).json({
    status: 'success',
    data: { warehouse: { id: warehouse.id, name: warehouse.name, code: warehouse.code }, items },
  });
});

// ------------------------------------------------------------------
// GET /api/v1/products/:id/stock
// Same view, flipped: one product's quantity across every warehouse
// it's stocked in.
// ------------------------------------------------------------------
exports.getProductStock = asyncHandler(async (req, res, next) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product) {
    return next(new ApiError('Product not found', 404));
  }

  const stocks = await prisma.stock.findMany({
    where: { productId: req.params.id },
    include: { warehouse: true },
    orderBy: { warehouse: { name: 'asc' } },
  });

  const items = stocks.map((s) => ({
    warehouseId: s.warehouseId,
    warehouseName: s.warehouse.name,
    warehouseCode: s.warehouse.code,
    quantity: s.quantity,
    reservedQuantity: s.reservedQuantity,
    availableQuantity: s.quantity - s.reservedQuantity,
  }));

  const totals = items.reduce(
    (acc, i) => ({
      quantity: acc.quantity + i.quantity,
      reservedQuantity: acc.reservedQuantity + i.reservedQuantity,
      availableQuantity: acc.availableQuantity + i.availableQuantity,
    }),
    { quantity: 0, reservedQuantity: 0, availableQuantity: 0 }
  );

  res.status(200).json({
    status: 'success',
    data: {
      product: { id: product.id, sku: product.sku, name: product.name },
      totals,
      items,
    },
  });
});
