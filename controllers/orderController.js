const asyncHandler = require("express-async-handler");
const prisma = require("../config/database");
const ApiError = require("../utils/apiError");
const { sendOrderInvoiceEmail } = require("../utils/email");
const { logAction } = require("../services/auditLogService");

exports.createOrder = asyncHandler(async (req, res, next) => {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return next(new ApiError("Order must contain at least one item", 400));
  }

  const order = await prisma.$transaction(
    async (tx) => {
      let totalAmount = 0;
      const orderItemsData = [];

      for (const { productId, warehouseId, quantity } of items) {
        if (!quantity || quantity <= 0) {
          throw new ApiError(`Invalid quantity for product ${productId}`, 400);
        }

        const product = await tx.product.findUnique({
          where: { id: productId },
        });
        if (!product || !product.isActive) {
          throw new ApiError(`Product ${productId} is not available`, 400);
        }

        const lockedStock = await tx.$queryRaw`
          SELECT id, quantity, "reservedQuantity"
          FROM stocks
          WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
          FOR UPDATE
        `;

        const stock = lockedStock[0];
        const availableQuantity = stock
          ? stock.quantity - stock.reservedQuantity
          : 0;

        if (!stock || availableQuantity < quantity) {
          throw new ApiError(
            `Insufficient stock for product ${product.name} in the selected warehouse`,
            409,
          );
        }

        await tx.stock.update({
          where: { id: stock.id },
          data: { quantity: { decrement: quantity } },
        });

        const unitPrice = product.price;
        totalAmount += Number(unitPrice) * quantity;

        orderItemsData.push({
          productId,
          warehouseId,
          quantity,
          unitPrice,
        });
      }

      const createdOrder = await tx.order.create({
        data: {
          userId: req.user.id,
          totalAmount,
          status: "CONFIRMED",
          items: { create: orderItemsData },
        },
        include: { items: true },
      });

      return createdOrder;
    },
    {
      isolationLevel: "ReadCommitted",
    },
  );

  res.status(201).json({ status: "success", data: { order } });

  sendOrderInvoiceEmail(req.user.email, order).catch((err) =>
    console.error(
      `Failed to send invoice email for order ${order.id}:`,
      err.message,
    ),
  );

  logAction({
    userId: req.user.id,
    action: "STOCK_OUT",
    entityType: "Order",
    entityId: order.id,
    metadata: { totalAmount: order.totalAmount, itemCount: order.items.length },
    req,
  });
});

exports.getMyOrders = asyncHandler(async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.user.id },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  res
    .status(200)
    .json({ status: "success", results: orders.length, data: { orders } });
});
