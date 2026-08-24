const prisma = require("../config/database");

const logAction = async ({
  userId,
  action,
  entityType,
  entityId,
  metadata,
  req,
}) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action,
        entityType,
        entityId: entityId ? String(entityId) : null,
        metadata: metadata || undefined,
        ipAddress: req?.ip,
        userAgent: req?.headers?.["user-agent"],
      },
    });
  } catch (err) {
    console.error("Failed to write audit log:", err.message);
  }
};

module.exports = { logAction };
