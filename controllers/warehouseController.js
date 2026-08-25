const asyncHandler = require('express-async-handler');
const prisma = require('../config/database');
const ApiError = require('../utils/apiError');
const { logAction } = require('../services/auditLogService');
const { getPagination } = require('../utils/pagination');

exports.getAllWarehouses = asyncHandler(async (req, res) => {
  const { skip, take, buildMeta } = getPagination(req.query);

  const [warehouses, total] = await Promise.all([
    prisma.warehouse.findMany({ orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.warehouse.count(),
  ]);

  res.status(200).json({ status: 'success', data: { warehouses }, meta: buildMeta(total) });
});

exports.getWarehouse = asyncHandler(async (req, res, next) => {
  const warehouse = await prisma.warehouse.findUnique({ where: { id: req.params.id } });
  if (!warehouse) {
    return next(new ApiError('Warehouse not found', 404));
  }
  res.status(200).json({ status: 'success', data: { warehouse } });
});

exports.createWarehouse = asyncHandler(async (req, res, next) => {
  const { name, code, address } = req.body;

  const existing = await prisma.warehouse.findUnique({ where: { code } });
  if (existing) {
    return next(new ApiError('A warehouse with this code already exists', 400));
  }

  const warehouse = await prisma.warehouse.create({ data: { name, code, address } });

  logAction({
    userId: req.user.id,
    action: 'CREATE',
    entityType: 'Warehouse',
    entityId: warehouse.id,
    req,
  });

  res.status(201).json({ status: 'success', data: { warehouse } });
});

exports.updateWarehouse = asyncHandler(async (req, res, next) => {
  const warehouse = await prisma.warehouse.findUnique({ where: { id: req.params.id } });
  if (!warehouse) {
    return next(new ApiError('Warehouse not found', 404));
  }

  const updated = await prisma.warehouse.update({
    where: { id: req.params.id },
    data: req.body,
  });

  logAction({
    userId: req.user.id,
    action: 'UPDATE',
    entityType: 'Warehouse',
    entityId: updated.id,
    req,
  });

  res.status(200).json({ status: 'success', data: { warehouse: updated } });
});

exports.deleteWarehouse = asyncHandler(async (req, res, next) => {
  const warehouse = await prisma.warehouse.findUnique({ where: { id: req.params.id } });
  if (!warehouse) {
    return next(new ApiError('Warehouse not found', 404));
  }

  await prisma.warehouse.delete({ where: { id: req.params.id } });

  logAction({
    userId: req.user.id,
    action: 'DELETE',
    entityType: 'Warehouse',
    entityId: req.params.id,
    req,
  });

  res.status(204).json({ status: 'success', data: null });
});
