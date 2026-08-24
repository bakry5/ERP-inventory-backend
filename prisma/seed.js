/* eslint-disable no-console */
const bcrypt = require('bcryptjs');
const prisma = require('../config/database');

const SEED_PASSWORD = 'Passw0rd!'; // change after first login in a real deployment

async function main() {
  console.log('Seeding database...');

  // ---------------- Users ----------------
  const hashedPassword = await bcrypt.hash(SEED_PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@erp.local' },
    update: {},
    create: {
      name: 'Super Admin',
      email: 'admin@erp.local',
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      isEmailVerified: true,
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@erp.local' },
    update: {},
    create: {
      name: 'Warehouse Manager',
      email: 'manager@erp.local',
      password: hashedPassword,
      role: 'WAREHOUSE_MANAGER',
      isEmailVerified: true,
    },
  });

  const customer = await prisma.user.upsert({
    where: { email: 'customer@erp.local' },
    update: {},
    create: {
      name: 'Test Customer',
      email: 'customer@erp.local',
      password: hashedPassword,
      role: 'CUSTOMER',
      isEmailVerified: true,
    },
  });

  console.log(`Users ready: ${admin.email}, ${manager.email}, ${customer.email}`);

  // ---------------- Warehouses ----------------
  const cairoWarehouse = await prisma.warehouse.upsert({
    where: { code: 'CAI-01' },
    update: {},
    create: { name: 'Cairo Main Warehouse', code: 'CAI-01', address: 'Cairo, Egypt' },
  });

  const alexWarehouse = await prisma.warehouse.upsert({
    where: { code: 'ALX-01' },
    update: {},
    create: { name: 'Alexandria Warehouse', code: 'ALX-01', address: 'Alexandria, Egypt' },
  });

  console.log(`Warehouses ready: ${cairoWarehouse.code}, ${alexWarehouse.code}`);

  // ---------------- Products ----------------
  const productsData = [
    { sku: 'LAP-001', name: 'Business Laptop 14"', description: '16GB RAM / 512GB SSD', price: 24999.99 },
    { sku: 'MOU-001', name: 'Wireless Mouse', description: 'Ergonomic, USB-C rechargeable', price: 349.5 },
    { sku: 'KEY-001', name: 'Mechanical Keyboard', description: 'Hot-swappable switches', price: 1299.0 },
    { sku: 'MON-001', name: '27" 4K Monitor', description: 'IPS panel, 60Hz', price: 8499.0 },
  ];

  const products = [];
  for (const data of productsData) {
    const product = await prisma.product.upsert({
      where: { sku: data.sku },
      update: {},
      create: data,
    });
    products.push(product);
  }

  console.log(`Products ready: ${products.map((p) => p.sku).join(', ')}`);

  // ---------------- Stock (per product, per warehouse) ----------------
  const stockSeed = [
    { sku: 'LAP-001', warehouseCode: 'CAI-01', quantity: 40 },
    { sku: 'LAP-001', warehouseCode: 'ALX-01', quantity: 15 },
    { sku: 'MOU-001', warehouseCode: 'CAI-01', quantity: 200 },
    { sku: 'MOU-001', warehouseCode: 'ALX-01', quantity: 80 },
    { sku: 'KEY-001', warehouseCode: 'CAI-01', quantity: 60 },
    { sku: 'MON-001', warehouseCode: 'CAI-01', quantity: 25 },
    { sku: 'MON-001', warehouseCode: 'ALX-01', quantity: 10 },
  ];

  const productBySku = Object.fromEntries(products.map((p) => [p.sku, p]));
  const warehouseByCode = { 'CAI-01': cairoWarehouse, 'ALX-01': alexWarehouse };

  for (const { sku, warehouseCode, quantity } of stockSeed) {
    await prisma.stock.upsert({
      where: {
        productId_warehouseId: {
          productId: productBySku[sku].id,
          warehouseId: warehouseByCode[warehouseCode].id,
        },
      },
      update: { quantity },
      create: {
        productId: productBySku[sku].id,
        warehouseId: warehouseByCode[warehouseCode].id,
        quantity,
      },
    });
  }

  console.log(`Stock rows seeded for ${stockSeed.length} product/warehouse combinations`);

  console.log('\nSeed complete. Login with:');
  console.log(`  admin@erp.local    / ${SEED_PASSWORD}  (SUPER_ADMIN)`);
  console.log(`  manager@erp.local  / ${SEED_PASSWORD}  (WAREHOUSE_MANAGER)`);
  console.log(`  customer@erp.local / ${SEED_PASSWORD}  (CUSTOMER)`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
