/**
 * Reads `?page=` and `?limit=` from the request query, clamps them to sane
 * bounds, and returns both the Prisma pagination args and the meta block to
 * send back in the response.
 *
 * Usage:
 *   const { skip, take, buildMeta } = getPagination(req.query);
 *   const [items, total] = await Promise.all([
 *     prisma.product.findMany({ skip, take, ... }),
 *     prisma.product.count({ where }),
 *   ]);
 *   res.json({ data: { items }, meta: buildMeta(total) });
 */
const getPagination = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const buildMeta = (total) => ({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  });

  return { page, limit, skip, take: limit, buildMeta };
};

module.exports = { getPagination };
