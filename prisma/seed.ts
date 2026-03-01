import { PrismaClient, Role, ProductCategory, UnitType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // 1) Ensure default admin (login: admin / password: admin)
  const login = "admin";
  const existing = await prisma.user.findUnique({ where: { login } });
  if (!existing) {
    const passwordHash = await bcrypt.hash("admin", 10);
    await prisma.user.create({
      data: {
        login,
        name: "Administrator",
        role: Role.ADMIN,
        passwordHash,
      },
    });
    console.log("✅ Seeded default admin (admin/admin)");
  } else {
    console.log("ℹ️ Default admin already exists");
  }

  // 2) Ensure base warehouses
  const mainWh = await prisma.warehouse.upsert({
    where: { id: "main-warehouse" },
    update: {},
    create: { id: "main-warehouse", name: "Magazyn główny" },
  });

  await prisma.warehouse.upsert({
    where: { id: "cabinet-warehouse" },
    update: { parentId: mainWh.id },
    create: { id: "cabinet-warehouse", name: "Szafa kosmetyczna", parentId: mainWh.id },
  });

  // 3) Seed example products + stock (optional, safe)
  const botox = await prisma.product.upsert({
    where: { id: "demo-botox" },
    update: {},
    create: {
      id: "demo-botox",
      category: ProductCategory.PREPARATION,
      name: "Botoks – preparat demo",
      unit: UnitType.BOTOX_UNIT,
      purchasePrice: 1000,
      salePrice: 2000,
    },
  });

  await prisma.stock.upsert({
    where: { productId_warehouseId: { productId: botox.id, warehouseId: mainWh.id } },
    update: {},
    create: { productId: botox.id, warehouseId: mainWh.id, quantity: 100 },
  });

  console.log("✅ Seed completed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
