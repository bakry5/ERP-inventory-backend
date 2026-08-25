const asyncHandler = require('express-async-handler');
const prisma = require('../config/database');
const ApiError = require('../utils/apiError');
const { sendOrderInvoiceEmail } = require('../utils/email');
const { logAction } = require('../services/auditLogService');
const { getPagination } = require('../utils/pagination');

// ------------------------------------------------------------------
// CREATE ORDER  ->  status PENDING, stock RESERVED (not yet deducted).
// body: { items: [{ productId, warehouseId, quantity }] }
//
// We don't touch `quantity` here — we only raise `reservedQuantity`, so the
// stock is provably committed to this order without physically leaving the
// warehouse count yet. That's what lets a pending order be cancelled later
// with a clean, guaranteed-safe rollback (see cancelOrder).
//
// Uses a Prisma interactive transaction with `FOR UPDATE` row locks on the
// stock rows involved, so two concurrent orders can never both reserve past
// the available quantity (classic overselling race condition).
// ------------------------------------------------------------------
exports.createOrder = asyncHandler(async (req, res, next) => {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return next(new ApiError('Order must contain at least one item', 400));
  }

  const order = await prisma.$transaction(
    async (tx) => {
      let totalAmount = 0;
      const orderItemsData = [];

      for (const { productId, warehouseId, quantity } of items) {
        if (!quantity || quantity <= 0) {
          throw new ApiError(`Invalid quantity for product ${productId}`, 400);
        }

        const product = await tx.product.findUnique({ where: { id: productId } });
        if (!product || !product.isActive) {
          throw new ApiError(`Product ${productId} is not available`, 400);
        }

        // Row-level lock: blocks any other transaction from reading/updating
        // this exact stock row until we commit or roll back. This is what
        // actually prevents overselling under concurrent checkouts.
        const lockedStock = await tx.$queryRaw`
          SELECT id, quantity, "reservedQuantity"
          FROM stocks
          WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
          FOR UPDATE
        `;

        const stock = lockedStock[0];
        const availableQuantity = stock ? stock.quantity - stock.reservedQuantity : 0;

        if (!stock || availableQuantity < quantity) {
          throw new ApiError(
            `Insufficient stock for product ${product.name} in the selected warehouse`,
            409
          );
        }

        // Reserve, don't deduct yet.
        await tx.stock.update({
          where: { id: stock.id },
          data: { reservedQuantity: { increment: quantity } },
        });

        const unitPrice = product.price;
        totalAmount += Number(unitPrice) * quantity;

        orderItemsData.push({ productId, warehouseId, quantity, unitPrice });
      }

      const createdOrder = await tx.order.create({
        data: {
          userId: req.user.id,
          totalAmount,
          status: 'PENDING',
          items: { create: orderItemsData },
        },
        include: { items: true },
      });

      return createdOrder;
    },
    { isolationLevel: 'ReadCommitted' }
  );

  logAction({
    userId: req.user.id,
    action: 'STOCK_OUT',
    entityType: 'Order',
    entityId: order.id,
    metadata: { totalAmount: order.totalAmount, itemCount: order.items.length, reserved: true },
    req,
  });

  res.status(201).json({ status: 'success', data: { order } });
});

// ------------------------------------------------------------------
// CONFIRM ORDER  ->  turns a reservation into an actual stock deduction.
// Restricted to ADMIN / WAREHOUSE_MANAGER via the route (fulfillment staff
// confirms an order is actually being packed/shipped). Only PENDING orders
// can be confirmed.
// ------------------------------------------------------------------
exports.confirmOrder = asyncHandler(async (req, res, next) => {
  const order = await prisma.$transaction(async (tx) => {
    const existing = await tx.order.findUnique({
      where: { id: req.params.id },
      include: { items: true, user: true },
    });

    if (!existing) throw new ApiError('Order not found', 404);
    if (existing.status !== 'PENDING') {
      throw new ApiError(
        `Only PENDING orders can be confirmed (this one is ${existing.status})`,
        400
      );
    }

    for (const item of existing.items) {
      const lockedStock = await tx.$queryRaw`
        SELECT id, quantity, "reservedQuantity"
        FROM stocks
        WHERE "productId" = ${item.productId} AND "warehouseId" = ${item.warehouseId}
        FOR UPDATE
      `;
      const stock = lockedStock[0];

      // Reservation moves from `reservedQuantity` into an actual deduction
      // from `quantity` — the physical count only drops now, at confirmation.
      await tx.stock.update({
        where: { id: stock.id },
        data: {
          quantity: { decrement: item.quantity },
          reservedQuantity: { decrement: item.quantity },
        },
      });
    }

    return tx.order.update({
      where: { id: req.params.id },
      data: { status: 'CONFIRMED' },
      include: { items: true, user: true },
    });
  });

  logAction({
    userId: req.user.id,
    action: 'STOCK_OUT',
    entityType: 'Order',
    entityId: order.id,
    metadata: { totalAmount: order.totalAmount, confirmed: true },
    req,
  });

  res.status(200).json({ status: 'success', data: { order } });

  // Fire-and-forget — the caller shouldn't wait on SMTP latency.
  sendOrderInvoiceEmail(order.user.email, order).catch((err) =>
    console.error(`Failed to send invoice email for order ${order.id}:`, err.message)
  );
});

// ------------------------------------------------------------------
// CANCEL ORDER  ->  releases the reservation, never touches `quantity`
// because a PENDING order never deducted it in the first place.
// The order's own owner can cancel their own pending order; admins/managers
// can cancel any pending order (route-level RBAC handles the distinction).
// ------------------------------------------------------------------
exports.cancelOrder = asyncHandler(async (req, res, next) => {
  const order = await prisma.$transaction(async (tx) => {
    const existing = await tx.order.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });

    if (!existing) throw new ApiError('Order not found', 404);

    const isOwner = existing.userId === req.user.id;
    const isStaff = ['SUPER_ADMIN', 'ADMIN', 'WAREHOUSE_MANAGER'].includes(req.user.role);
    if (!isOwner && !isStaff) {
      throw new ApiError('You are not allowed to cancel this order', 403);
    }

    if (existing.status !== 'PENDING') {
      throw new ApiError(
        `Only PENDING orders can be cancelled (this one is ${existing.status})`,
        400
      );
    }

    for (const item of existing.items) {
      const lockedStock = await tx.$queryRaw`
        SELECT id FROM stocks
        WHERE "productId" = ${item.productId} AND "warehouseId" = ${item.warehouseId}
        FOR UPDATE
      `;
      const stock = lockedStock[0];

      await tx.stock.update({
        where: { id: stock.id },
        data: { reservedQuantity: { decrement: item.quantity } },
      });
    }

    return tx.order.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
      include: { items: true },
    });
  });

  logAction({
    userId: req.user.id,
    action: 'STOCK_IN',
    entityType: 'Order',
    entityId: order.id,
    metadata: { released: true },
    req,
  });

  res.status(200).json({ status: 'success', data: { order } });
});

exports.getMyOrders = asyncHandler(async (req, res) => {
  const { skip, take, buildMeta } = getPagination(req.query);
  const where = { userId: req.user.id };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.order.count({ where }),
  ]);

  res.status(200).json({ status: 'success', data: { orders }, meta: buildMeta(total) });
});

// ------------------------------------------------------------------
// GET /api/v1/orders  (staff-only — SUPER_ADMIN, ADMIN, WAREHOUSE_MANAGER)
// Every order in the system, not just the caller's own. Optional
// ?status=PENDING filter — this is the endpoint fulfillment staff use to
// find orders waiting on confirmOrder/cancelOrder.
// ------------------------------------------------------------------
exports.getAllOrders = asyncHandler(async (req, res) => {
  const { skip, take, buildMeta } = getPagination(req.query);
  const where = req.query.status ? { status: req.query.status } : {};

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { items: true, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.order.count({ where }),
  ]);

  res.status(200).json({ status: 'success', data: { orders }, meta: buildMeta(total) });
});

// ------------------------------------------------------------------
// GET /api/v1/orders/:id  (the order's owner, or staff)
// ------------------------------------------------------------------
exports.getOrder = asyncHandler(async (req, res, next) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: { include: { product: true } }, user: { select: { id: true, name: true, email: true } } },
  });

  if (!order) {
    return next(new ApiError('Order not found', 404));
  }

  const isOwner = order.userId === req.user.id;
  const isStaff = ['SUPER_ADMIN', 'ADMIN', 'WAREHOUSE_MANAGER'].includes(req.user.role);
  if (!isOwner && !isStaff) {
    return next(new ApiError('You are not allowed to view this order', 403));
  }

  res.status(200).json({ status: 'success', data: { order } });
});

// ------------------------------------------------------------------
// Fulfillment status transitions past CONFIRMED — these don't touch stock
// (that already happened at confirmOrder), they just move the order through
// its shipping lifecycle. Staff-only via the route.
// ------------------------------------------------------------------
const transitionOrderStatus = (fromStatuses, toStatus) =>
  asyncHandler(async (req, res, next) => {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) {
      return next(new ApiError('Order not found', 404));
    }
    if (!fromStatuses.includes(order.status)) {
      return next(
        new ApiError(
          `Cannot move an order from ${order.status} to ${toStatus} (expected one of: ${fromStatuses.join(', ')})`,
          400
        )
      );
    }

    const updated = await prisma.order.update({
      where: { id: req.params.id },
      data: { status: toStatus },
      include: { items: true },
    });

    logAction({
      userId: req.user.id,
      action: 'UPDATE',
      entityType: 'Order',
      entityId: updated.id,
      metadata: { fromStatus: order.status, toStatus },
      req,
    });

    res.status(200).json({ status: 'success', data: { order: updated } });
  });

exports.shipOrder = transitionOrderStatus(['CONFIRMED'], 'SHIPPED');
exports.deliverOrder = transitionOrderStatus(['SHIPPED'], 'DELIVERED');

// Refund is reachable from CONFIRMED/SHIPPED/DELIVERED — the money side of a
// refund (payment gateway) is out of scope here; this only marks the order
// and is the hook point where that integration would plug in.
exports.refundOrder = transitionOrderStatus(['CONFIRMED', 'SHIPPED', 'DELIVERED'], 'REFUNDED');

