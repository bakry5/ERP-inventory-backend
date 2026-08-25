const asyncHandler = require('express-async-handler');
const prisma = require('../config/database');
const ApiError = require('../utils/apiError');
const { logAction } = require('../services/auditLogService');
const { getPagination } = require('../utils/pagination');
const { uploadBufferToCloudinary, deleteFromCloudinary } = require('../utils/cloudinaryUpload');

// ------------------------------------------------------------------
// GET /api/v1/products
// Paginated, with an optional ?search= that matches name OR sku
// (case-insensitive). Only active products are listed by default.
// ------------------------------------------------------------------
exports.getAllProducts = asyncHandler(async (req, res) => {
  const { skip, take, buildMeta } = getPagination(req.query);

  const where = {
    isActive: true,
    ...(req.query.search && {
      OR: [
        { name: { contains: req.query.search, mode: 'insensitive' } },
        { sku: { contains: req.query.search, mode: 'insensitive' } },
      ],
    }),
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.product.count({ where }),
  ]);

  res.status(200).json({ status: 'success', data: { products }, meta: buildMeta(total) });
});

exports.getProduct = asyncHandler(async (req, res, next) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: { stocks: { include: { warehouse: true } } },
  });
  if (!product) {
    return next(new ApiError('Product not found', 404));
  }
  res.status(200).json({ status: 'success', data: { product } });
});

exports.createProduct = asyncHandler(async (req, res, next) => {
  const { sku, name, description, price } = req.body;

  const existing = await prisma.product.findUnique({ where: { sku } });
  if (existing) {
    return next(new ApiError('A product with this SKU already exists', 400));
  }

  const product = await prisma.product.create({ data: { sku, name, description, price } });

  logAction({
    userId: req.user.id,
    action: 'CREATE',
    entityType: 'Product',
    entityId: product.id,
    req,
  });

  res.status(201).json({ status: 'success', data: { product } });
});

exports.updateProduct = asyncHandler(async (req, res, next) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product) {
    return next(new ApiError('Product not found', 404));
  }

  const updated = await prisma.product.update({
    where: { id: req.params.id },
    data: req.body,
  });

  logAction({
    userId: req.user.id,
    action: 'UPDATE',
    entityType: 'Product',
    entityId: updated.id,
    req,
  });

  res.status(200).json({ status: 'success', data: { product: updated } });
});

exports.deleteProduct = asyncHandler(async (req, res, next) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product) {
    return next(new ApiError('Product not found', 404));
  }

  // Soft delete — keeps historical OrderItem rows valid instead of a hard
  // delete that Prisma's FK constraint would reject anyway once orders exist.
  await prisma.product.update({ where: { id: req.params.id }, data: { isActive: false } });

  logAction({
    userId: req.user.id,
    action: 'DELETE',
    entityType: 'Product',
    entityId: req.params.id,
    req,
  });

  res.status(204).json({ status: 'success', data: null });
});

// ------------------------------------------------------------------
// UPLOAD PRODUCT IMAGE  ->  POST /:id/image (multipart/form-data, field "image")
// Restricted to ADMIN / SUPER_ADMIN via the route. Replaces any existing
// image: the old Cloudinary asset is deleted only *after* the new one
// uploads successfully, so a failed upload never leaves the product
// pointing at a broken/missing image.
// ------------------------------------------------------------------
exports.uploadProductImage = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new ApiError('No image file was provided', 400));
  }

  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product) {
    return next(new ApiError('Product not found', 404));
  }

  const result = await uploadBufferToCloudinary(req.file.buffer, 'erp-inventory/products');

  const previousPublicId = product.imagePublicId;

  const updated = await prisma.product.update({
    where: { id: req.params.id },
    data: { imageUrl: result.secure_url, imagePublicId: result.public_id },
  });

  if (previousPublicId) {
    deleteFromCloudinary(previousPublicId).catch((err) =>
      console.error(`Failed to delete old product image ${previousPublicId}:`, err.message)
    );
  }

  logAction({
    userId: req.user.id,
    action: 'UPDATE',
    entityType: 'Product',
    entityId: updated.id,
    metadata: { imageUpdated: true },
    req,
  });

  res.status(200).json({ status: 'success', data: { product: updated } });
});

// ------------------------------------------------------------------
// DELETE PRODUCT IMAGE
// ------------------------------------------------------------------
exports.deleteProductImage = asyncHandler(async (req, res, next) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product) {
    return next(new ApiError('Product not found', 404));
  }
  if (!product.imagePublicId) {
    return next(new ApiError('This product has no image to delete', 400));
  }

  await deleteFromCloudinary(product.imagePublicId);

  const updated = await prisma.product.update({
    where: { id: req.params.id },
    data: { imageUrl: null, imagePublicId: null },
  });

  logAction({
    userId: req.user.id,
    action: 'UPDATE',
    entityType: 'Product',
    entityId: updated.id,
    metadata: { imageRemoved: true },
    req,
  });

  res.status(200).json({ status: 'success', data: { product: updated } });
});

// ------------------------------------------------------------------
// ADJUST STOCK — manual stock-in / stock-out (positive/negative quantity).
// Restricted to ADMIN / WAREHOUSE_MANAGER via the `allowedTo` middleware
// on the route. Uses the same FOR UPDATE row-locking pattern as order
// creation so a manual adjustment can never race with a concurrent order.
// ------------------------------------------------------------------
exports.adjustStock = asyncHandler(async (req, res, next) => {
  const { productId, warehouseId, quantity } = req.body;

  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product) throw new ApiError('Product not found', 404);

    const warehouse = await tx.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new ApiError('Warehouse not found', 404);

    const existingLocked = await tx.$queryRaw`
      SELECT id, quantity FROM stocks
      WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
      FOR UPDATE
    `;

    let stock;
    if (existingLocked[0]) {
      const newQuantity = existingLocked[0].quantity + quantity;
      if (newQuantity < 0) {
        throw new ApiError('Adjustment would result in negative stock', 400);
      }
      stock = await tx.stock.update({
        where: { id: existingLocked[0].id },
        data: { quantity: newQuantity },
      });
    } else {
      if (quantity < 0) {
        throw new ApiError('Cannot remove stock that does not exist yet', 400);
      }
      stock = await tx.stock.create({
        data: { productId, warehouseId, quantity },
      });
    }

    return stock;
  });

  logAction({
    userId: req.user.id,
    action: quantity > 0 ? 'STOCK_IN' : 'STOCK_OUT',
    entityType: 'Stock',
    entityId: result.id,
    metadata: { productId, warehouseId, quantity },
    req,
  });

  res.status(200).json({ status: 'success', data: { stock: result } });
});
