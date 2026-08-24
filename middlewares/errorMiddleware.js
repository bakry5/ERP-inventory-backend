const ApiError = require('../utils/apiError');

const sendErrorForDev = (err, res) =>
  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
    stack: err.stack,
  });

const sendErrorForProd = (err, res) =>
  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
  });

const handleJwtInvalidSignature = () =>
  new ApiError('Invalid token, please login again', 401);

const handleJwtExpired = () => new ApiError('Expired token, please login again', 401);

// Prisma throws structured errors with a `code` (e.g. P2002 = unique constraint).
// We translate the common ones into clean, operational ApiErrors instead of
// leaking raw Prisma internals to the client.
const handlePrismaKnownError = (err) => {
  if (err.code === 'P2002') {
    const field = err.meta?.target?.join(', ') || 'field';
    return new ApiError(`Duplicate value for unique field: ${field}`, 400);
  }
  if (err.code === 'P2025') {
    return new ApiError('Record not found', 404);
  }
  if (err.code === 'P2003') {
    return new ApiError('Invalid reference to a related record', 400);
  }
  return new ApiError('Database error', 500);
};

const globalError = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (err.name === 'JsonWebTokenError') err = handleJwtInvalidSignature();
  if (err.name === 'TokenExpiredError') err = handleJwtExpired();
  if (err.code && err.code.startsWith?.('P')) err = handlePrismaKnownError(err);

  if (process.env.NODE_ENV === 'development') {
    sendErrorForDev(err, res);
  } else {
    sendErrorForProd(err, res);
  }
};

module.exports = globalError;
