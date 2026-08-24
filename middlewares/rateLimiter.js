const { Ratelimit } = require("@upstash/ratelimit");
const redis = require("../config/redis");
const ApiError = require("../utils/apiError");

const createRateLimiter = (prefix, limit, window) => {
  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    prefix,
  });

  return async (req, res, next) => {
    const identifier = `${req.ip}:${req.body?.email || "anon"}`;

    const { success, remaining, reset } = await ratelimit.limit(identifier);

    res.setHeader("X-RateLimit-Remaining", remaining);

    if (!success) {
      const retryAfterSeconds = Math.max(
        0,
        Math.ceil((reset - Date.now()) / 1000),
      );
      res.setHeader("Retry-After", retryAfterSeconds);
      return next(
        new ApiError("Too many requests, please try again later", 429),
      );
    }

    next();
  };
};

module.exports = createRateLimiter;
