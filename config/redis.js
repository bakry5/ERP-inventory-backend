const { Redis } = require('@upstash/redis');

// Upstash's REST client is stateless/serverless-friendly — no persistent
// TCP connection to manage, which is exactly what we want on Vercel.
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = redis;
