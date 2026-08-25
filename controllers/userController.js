const asyncHandler = require('express-async-handler');
const prisma = require('../config/database');
const ApiError = require('../utils/apiError');
const { getPagination } = require('../utils/pagination');
const { logAction } = require('../services/auditLogService');

const sanitizeUser = (user) => {
  const { password, ...safeUser } = user;
  return safeUser;
};

// ------------------------------------------------------------------
// GET /api/v1/users  (SUPER_ADMIN, ADMIN)
// Optional ?role=CUSTOMER filter, paginated.
// ------------------------------------------------------------------
exports.getAllUsers = asyncHandler(async (req, res) => {
  const { skip, take, buildMeta } = getPagination(req.query);
  const where = req.query.role ? { role: req.query.role } : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.user.count({ where }),
  ]);

  res.status(200).json({
    status: 'success',
    data: { users: users.map(sanitizeUser) },
    meta: buildMeta(total),
  });
});

// ------------------------------------------------------------------
// GET /api/v1/users/:id  (SUPER_ADMIN, ADMIN)
// ------------------------------------------------------------------
exports.getUser = asyncHandler(async (req, res, next) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) {
    return next(new ApiError('User not found', 404));
  }
  res.status(200).json({ status: 'success', data: { user: sanitizeUser(user) } });
});

// ------------------------------------------------------------------
// PATCH /api/v1/users/:id/role  (SUPER_ADMIN only)
// Changing a role is itself a security-relevant action — restricted tighter
// than everyday user administration.
// ------------------------------------------------------------------
exports.updateUserRole = asyncHandler(async (req, res, next) => {
  const { role } = req.body;

  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return next(new ApiError('User not found', 404));
  }

  if (existing.id === req.user.id) {
    return next(new ApiError('You cannot change your own role', 400));
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { role },
  });

  logAction({
    userId: req.user.id,
    action: 'UPDATE',
    entityType: 'User',
    entityId: user.id,
    metadata: { previousRole: existing.role, newRole: role },
    req,
  });

  res.status(200).json({ status: 'success', data: { user: sanitizeUser(user) } });
});

// ------------------------------------------------------------------
// PATCH /api/v1/users/:id/deactivate  (SUPER_ADMIN, ADMIN)
// Soft-disable rather than delete — `protect` middleware already rejects
// any request from an inactive user, so this takes effect immediately even
// on their currently-open sessions.
// ------------------------------------------------------------------
exports.deactivateUser = asyncHandler(async (req, res, next) => {
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return next(new ApiError('User not found', 404));
  }

  if (existing.id === req.user.id) {
    return next(new ApiError('You cannot deactivate your own account', 400));
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });

  logAction({
    userId: req.user.id,
    action: 'UPDATE',
    entityType: 'User',
    entityId: user.id,
    metadata: { isActive: false },
    req,
  });

  res.status(200).json({ status: 'success', data: { user: sanitizeUser(user) } });
});

exports.reactivateUser = asyncHandler(async (req, res, next) => {
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return next(new ApiError('User not found', 404));
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { isActive: true },
  });

  logAction({
    userId: req.user.id,
    action: 'UPDATE',
    entityType: 'User',
    entityId: user.id,
    metadata: { isActive: true },
    req,
  });

  res.status(200).json({ status: 'success', data: { user: sanitizeUser(user) } });
});
