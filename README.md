# Multi-Warehouse Inventory & ERP System — Backend

Node.js + Express (plain JS, CommonJS) · PostgreSQL (Neon) via Prisma · Upstash Redis · JWT (httpOnly cookies).

## Folder structure

```
erp-inventory-backend/
├── prisma/
│   └── schema.prisma          # User, Warehouse, Product, Stock, Order, OrderItem, AuditLog
├── config/
│   ├── database.js            # Prisma client singleton (safe for serverless cold starts)
│   ├── redis.js                # Upstash Redis REST client
│   └── cloudinary.js           # Cloudinary SDK config (product image uploads)
├── controllers/
│   ├── authController.js      # register, verifyOtp, resendOtp, login, logout, refreshToken,
│   │                           #   forgotPassword, resetPassword, getMe, updateMe, updatePassword
│   ├── orderController.js     # createOrder/confirmOrder/cancelOrder (reserve→confirm lifecycle),
│   │                           #   getAllOrders, getOrder, shipOrder, deliverOrder, refundOrder
│   ├── warehouseController.js # warehouse CRUD (RBAC: admin-only writes, blocks delete-with-stock)
│   ├── productController.js   # product CRUD, adjustStock, uploadProductImage, deleteProductImage
│   ├── stockController.js     # getWarehouseStock, getProductStock (read-only inventory views)
│   └── userController.js      # admin user management: list, view, change role, (de)activate
├── middlewares/
│   ├── authMiddleware.js      # protect, requireEmailVerified, allowedTo (RBAC)
│   ├── rateLimiter.js         # Upstash sliding-window limiter factory
│   ├── errorMiddleware.js     # global error handler (JWT + Prisma + Multer error translation)
│   ├── uploadMiddleware.js    # multer memory storage + image-only filter, 5MB cap
│   └── validatorMiddleware.js
├── routes/
│   ├── authRoute.js
│   ├── orderRoute.js
│   ├── warehouseRoute.js
│   ├── productRoute.js
│   └── userRoute.js
├── services/
│   └── auditLogService.js
├── utils/
│   ├── apiError.js
│   ├── tokens.js               # access/refresh JWT generation + cookie helpers
│   ├── otp.js                  # OTP + reset-token generation/hashing
│   ├── email.js                # Nodemailer transporter (Brevo SMTP) + templates
│   ├── pagination.js           # shared ?page/?limit parsing + response meta
│   └── cloudinaryUpload.js     # buffer → Cloudinary upload/delete helpers
├── validators/
│   ├── authValidator.js
│   ├── warehouseValidator.js
│   ├── productValidator.js
│   ├── orderValidator.js
│   └── userValidator.js
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

**Pagination**
Every list endpoint (`GET /products`, `/warehouses`, `/orders`, `/orders/my-orders`, `/users`)
accepts `?page=` (default 1) and `?limit=` (default 20, capped at 100) and returns a `meta` block
alongside `data`: `{ page, limit, total, totalPages }`. `GET /products` also accepts `?search=`,
matched case-insensitively against both `name` and `sku`.

## API routes

| Method | Route | Access | Notes |
|---|---|---|---|
| POST | `/auth/register` | public | sends OTP, no session yet |
| POST | `/auth/verify-otp` | public | activates account, sets cookies |
| POST | `/auth/resend-otp` | public | |
| POST | `/auth/login` | public | |
| POST | `/auth/logout` | authenticated | clears cookies for this device |
| POST | `/auth/refresh-token` | authenticated (refresh cookie) | |
| POST | `/auth/forgot-password` | public | |
| PATCH | `/auth/reset-password/:token` | public (valid token) | bumps `tokenVersion` — logs out every device |
| GET | `/auth/me` | authenticated | |
| PATCH | `/auth/update-me` | authenticated | name and/or email; changing email un-verifies + re-sends OTP |
| PATCH | `/auth/update-password` | authenticated | requires `currentPassword`; bumps `tokenVersion` — logs out every *other* device, this session stays in |
| GET | `/warehouses` | authenticated | paginated |
| GET | `/warehouses/:id` | authenticated | |
| GET | `/warehouses/:id/stock` | authenticated | every product's quantity in this warehouse |
| POST / PATCH | `/warehouses` `/warehouses/:id` | `SUPER_ADMIN`, `ADMIN` | |
| DELETE | `/warehouses/:id` | `SUPER_ADMIN` | rejected (409) if the warehouse still has any stock rows |
| GET | `/products` | authenticated | paginated, `?search=` |
| GET | `/products/:id` | authenticated | |
| GET | `/products/:id/stock` | authenticated | this product's quantity across every warehouse |
| POST / PATCH | `/products` `/products/:id` | `SUPER_ADMIN`, `ADMIN` | |
| DELETE | `/products/:id` | `SUPER_ADMIN` | soft delete |
| POST | `/products/stock/adjust` | `SUPER_ADMIN`, `ADMIN`, `WAREHOUSE_MANAGER` | manual stock-in/out |
| POST | `/products/:id/image` | `SUPER_ADMIN`, `ADMIN` | multipart field `image`, max 5MB — uploads to Cloudinary |
| DELETE | `/products/:id/image` | `SUPER_ADMIN`, `ADMIN` | removes the Cloudinary asset + clears `imageUrl` |
| GET | `/orders/my-orders` | authenticated | own orders, paginated |
| GET | `/orders` | staff (`SUPER_ADMIN`/`ADMIN`/`WAREHOUSE_MANAGER`) | every order, `?status=` filter |
| GET | `/orders/:id` | owner or staff | |
| POST | `/orders` | authenticated + email-verified | creates `PENDING`, reserves stock |
| PATCH | `/orders/:id/confirm` | staff | reserved → deducted, status `CONFIRMED` |
| PATCH | `/orders/:id/cancel` | owner or staff | releases reservation, status `CANCELLED` |
| PATCH | `/orders/:id/ship` | staff | `CONFIRMED` → `SHIPPED` |
| PATCH | `/orders/:id/deliver` | staff | `SHIPPED` → `DELIVERED` |
| PATCH | `/orders/:id/refund` | `SUPER_ADMIN`, `ADMIN` | `CONFIRMED`/`SHIPPED`/`DELIVERED` → `REFUNDED` (marks the order only — no payment-gateway integration here) |
| GET | `/users` | `SUPER_ADMIN`, `ADMIN` | paginated, `?role=` filter |
| GET | `/users/:id` | `SUPER_ADMIN`, `ADMIN` | |
| PATCH | `/users/:id/deactivate` `/users/:id/reactivate` | `SUPER_ADMIN`, `ADMIN` | can't deactivate yourself |
| PATCH | `/users/:id/role` | `SUPER_ADMIN` only | can't change your own role |

## RBAC — `allowedTo` middleware

`middlewares/authMiddleware.js` exports `allowedTo(...roles)`. It's applied per-route, after
`protect`, e.g.:

```js
router.post('/', allowedTo('SUPER_ADMIN', 'ADMIN'), createWarehouseValidator, warehouseController.createWarehouse);
```

See the routes table above for the full set of role gates.

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

### Getting Cloudinary credentials (for product images)

1. Create a free account at [cloudinary.com](https://cloudinary.com).
2. Your dashboard homepage shows **Cloud name**, **API Key**, and **API Secret** directly — copy
   all three into `.env` as `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
3. Uploads go through `POST /api/v1/products/:id/image` as `multipart/form-data` with the file in
   a field named `image` (5MB max, images only) — uploaded assets land in the `erp-inventory/products`
   folder in your Cloudinary media library.

