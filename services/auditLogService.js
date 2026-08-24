const prisma = require('../config/database');

/**
 * Writes an audit trail row. Never throws into the caller's request flow —
 * a failed audit write shouldn't fail the business operation it's logging.
 */
const logAction = async ({ userId, action, entityType, entityId, metadata, req }) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action,
        entityType,
        entityId: entityId ? String(entityId) : null,
        metadata: metadata || undefined,
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent'],
      },
    });
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
  }
};

module.exports = { logAction };
