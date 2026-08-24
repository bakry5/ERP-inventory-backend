# Multi-Warehouse Inventory & ERP System — Backend

Node.js + Express (plain JS, CommonJS) · PostgreSQL (Neon) via Prisma · Upstash Redis · JWT (httpOnly cookies).

## Folder structure

```
erp-inventory-backend/
├── prisma/
│   └── schema.prisma          # User, Warehouse, Product, Stock, Order, OrderItem, AuditLog
├── config/
│   ├── database.js            # Prisma client singleton (safe for serverless cold starts)
│   └── redis.js                # Upstash Redis REST client
├── controllers/
│   ├── authController.js      # register, verifyOtp, resendOtp, login, logout,
│   │                           #   refreshToken, forgotPassword, resetPassword, getMe
│   ├── orderController.js     # createOrder ($transaction + FOR UPDATE row locking)
│   ├── warehouseController.js # warehouse CRUD (RBAC: admin-only writes)
│   └── productController.js   # product CRUD + adjustStock (manual stock in/out)
├── middlewares/
│   ├── authMiddleware.js      # protect, requireEmailVerified, allowedTo (RBAC)
│   ├── rateLimiter.js         # Upstash sliding-window limiter factory
│   ├── errorMiddleware.js     # global error handler (JWT + Prisma error translation)
│   └── validatorMiddleware.js
├── routes/
│   ├── authRoute.js
│   ├── orderRoute.js
│   ├── warehouseRoute.js
│   └── productRoute.js
├── services/
│   └── auditLogService.js
├── utils/
│   ├── apiError.js
│   ├── tokens.js               # access/refresh JWT generation + cookie helpers
│   ├── otp.js                  # OTP + reset-token generation/hashing
│   └── email.js                # Nodemailer transporter (Brevo SMTP) + templates
├── validators/
│   ├── authValidator.js
│   ├── warehouseValidator.js
│   └── productValidator.js
├── prisma/
│   └── seed.js                 # seeds admin/manager/customer users, warehouses, products, stock
├── server.js
├── .env.example
└── package.json
```

## How the auth pipeline fits together

**Register → OTP → verified**
`POST /api/v1/auth/register` creates the user (`isEmailVerified: false`), generates a 6-digit
OTP, stores it in Redis as `otp:<email>` with a 10-minute TTL, and emails it. No cookies are set
yet — the account isn't trusted until `POST /api/v1/auth/verify-otp` matches the code, at which
point `isEmailVerified` flips to `true` and the first access/refresh cookies are issued.

**tokenVersion — the mechanism behind "log out everywhere"**
Every access and refresh JWT embeds the user's current `tokenVersion` at issue-time. `protect`
(and `refreshToken`) re-fetch the user row and compare it against the value baked into the token.
`resetPassword` does a single `tokenVersion: { increment: 1 }` — that one write silently
invalidates every access/refresh token already handed out on every device, with no need to track
individual sessions. The user's *current* device also gets `clearAuthCookies` explicitly; every
other device simply fails its next `protect`/`refresh-token` check.

**Forgot/reset password**
`forgotPassword` generates a random token, emails the raw value as a link, but stores only its
SHA-256 hash in Redis (`pwreset:<hash>` → `userId`, 15-min TTL) — so a Redis leak alone can't be
replayed. `resetPassword` looks the hash up, updates the password, bumps `tokenVersion`, deletes
the Redis key (one-time use), and sends a "your password changed" notice.

**Order lifecycle — reserve, then confirm or cancel**
Orders don't deduct stock the instant they're created. `createOrder` raises `Stock.reservedQuantity`
(never `Stock.quantity`) and sets the order to `PENDING`. Every line item's stock row is locked with
a raw `SELECT ... FOR UPDATE` first — that row lock, not an application-level `if (quantity >=
needed)` check, is what stops two simultaneous checkouts from reserving past the same available
quantity.

From `PENDING`, an order goes one of two ways:
- `PATCH /api/v1/orders/:id/confirm` (staff-only: `SUPER_ADMIN`/`ADMIN`/`WAREHOUSE_MANAGER`) — the
  reservation becomes real: `quantity` is decremented and `reservedQuantity` released by the same
  amount, status becomes `CONFIRMED`, and the invoice email fires *after* the response is sent, so
  the caller isn't waiting on SMTP.
- `PATCH /api/v1/orders/:id/cancel` (the order's owner, or staff) — only `reservedQuantity` is
  released; `quantity` was never touched, so cancelling a pending order is a clean no-op on the
  physical stock count.

Both endpoints re-lock the same stock rows with `FOR UPDATE` before touching them, for the same
overselling-prevention reason as `createOrder`.

**Stock visibility**
`GET /api/v1/warehouses/:id/stock` and `GET /api/v1/products/:id/stock` both return `quantity`,
`reservedQuantity`, and the derived `availableQuantity` (`quantity - reservedQuantity`) — the number
that actually matters when deciding whether a new order can be placed.

## RBAC — `allowedTo` middleware

`middlewares/authMiddleware.js` exports `allowedTo(...roles)`. It's applied per-route, after
`protect`, e.g.:

```js
router.post('/', allowedTo('SUPER_ADMIN', 'ADMIN'), createWarehouseValidator, warehouseController.createWarehouse);
```

Current role gates:
- **Warehouses** — read: any authenticated role. Create/update: `SUPER_ADMIN`, `ADMIN`. Delete: `SUPER_ADMIN` only.
- **Products** — read: any authenticated role. Create/update: `SUPER_ADMIN`, `ADMIN`. Delete: `SUPER_ADMIN` only.
- **Stock adjustment** (`POST /api/v1/products/stock/adjust`) — `SUPER_ADMIN`, `ADMIN`, `WAREHOUSE_MANAGER` (day-to-day stock-in/out is a warehouse manager's job, so it gets a wider role list than product deletion).
- **Orders** — any authenticated + email-verified user can place an order for themselves.

## Seeding

`prisma/seed.js` creates three users (all sharing the password below — change it after first
login), two warehouses, four products, and initial stock rows across both warehouses. It's
idempotent (`upsert`), so running it more than once won't create duplicates.

```bash
npx prisma db seed
# or
npm run prisma:seed
```

| Email | Password | Role |
|---|---|---|
| admin@erp.local | `Passw0rd!` | SUPER_ADMIN |
| manager@erp.local | `Passw0rd!` | WAREHOUSE_MANAGER |
| customer@erp.local | `Passw0rd!` | CUSTOMER |

## Setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL (from Neon), Upstash + SMTP credentials, JWT secrets
npx prisma migrate dev --name init
npx prisma db seed     # optional but recommended — creates admin/manager/customer test users
npm run start:dev
```

### Getting `DATABASE_URL` from Neon

1. Create a project at [neon.com](https://neon.com) (GitHub login, no card needed on the free tier).
2. On the project dashboard, copy the **Connection string** shown — it already includes `?sslmode=require`.
3. Paste it as `DATABASE_URL` in `.env`, then run `npx prisma migrate dev --name init` to create the tables.
