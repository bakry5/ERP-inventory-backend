const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const morgan = require('morgan');
const helmet = require('helmet');
const hpp = require('hpp');
const xss = require('xss-clean');

dotenv.config({ path: '.env' });

const ApiError = require('./utils/apiError');
const globalError = require('./middlewares/errorMiddleware');

const authRoute = require('./routes/authRoute');
const orderRoute = require('./routes/orderRoute');
const warehouseRoute = require('./routes/warehouseRoute');
const productRoute = require('./routes/productRoute');

const app = express();

// --- Security headers ---
app.use(helmet());

// --- CORS scoped to the Next.js frontend, credentials for httpOnly cookies ---
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// --- Data sanitization ---
app.use(hpp()); // HTTP Parameter Pollution
app.use(xss()); // strips malicious HTML/script from input

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use('/api/v1/auth', authRoute);
app.use('/api/v1/orders', orderRoute);
app.use('/api/v1/warehouses', warehouseRoute);
app.use('/api/v1/products', productRoute);

app.get('/', (req, res) => {
  res.send('ERP Inventory API is running');
});

app.all('*', (req, res, next) => {
  next(new ApiError(`Can't find this route: ${req.originalUrl}`, 400));
});

app.use(globalError);

const PORT = process.env.PORT || 8000;

if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => {
    console.log(`App running on port ${PORT}`);
  });

  process.on('unhandledRejection', (err) => {
    console.error(`UnhandledRejection Error: ${err.name} | ${err.message}`);
    server.close(() => {
      console.error('Shutting down...');
      process.exit(1);
    });
  });
}

module.exports = app;
