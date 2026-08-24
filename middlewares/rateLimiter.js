const { Ratelimit } = require('@upstash/ratelimit');
const redis = require('../config/redis');
const ApiError = require('../utils/apiError');

/**
 * Builds an Express middleware backed by an Upstash sliding-window limiter.
 * Each call creates its own limiter+prefix so different routes (login, OTP
 * requests, password-reset requests) get independent buckets.
 *
 * @param {string} prefix   redis key prefix, e.g. "ratelimit:login"
 * @param {number} limit    max requests allowed in the window
 * @param {string} window   e.g. "1 m", "15 m"
 */
const createRateLimiter = (prefix, limit, window) => {
  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    prefix,
  });

  return async (req, res, next) => {
    // Key by IP + email (when present) so one bad actor can't lock out a
    // shared office IP, but also can't hammer a single account from many IPs.
    const identifier = `${req.ip}:${req.body?.email || 'anon'}`;

    const { success, remaining, reset } = await ratelimit.limit(identifier);

    res.setHeader('X-RateLimit-Remaining', remaining);

    if (!success) {
      const retryAfterSeconds = Math.max(0, Math.ceil((reset - Date.now()) / 1000));
      res.setHeader('Retry-After', retryAfterSeconds);
      return next(new ApiError('Too many requests, please try again later', 429));
    }

    next();
  };
};

module.exports = createRateLimiter;
