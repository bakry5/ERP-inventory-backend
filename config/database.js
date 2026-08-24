const { PrismaClient } = require('@prisma/client');

// Prevent creating multiple PrismaClient instances in dev (nodemon hot-reload)
// and on serverless cold starts (Vercel functions reuse the module cache).
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
