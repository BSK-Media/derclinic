import { PrismaClient, Role, ProductCategory, UnitType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const INVENTORY: Record<string, string[]> = {
  "TEOXANE": [
    "Redensity 1",
    "Redensity 2",
    "RHA 2",
    "RHA 3",
    "RHA 4",
    "RHA Kiss Volume",
    "Ultra Deep"
  ],
  "JALUPRO": [
    "Jalupro Super Hydro",
    "Jalupro HMW",
    "Jalupro Classic",
    "Jalupro Young Eye",
    "Jalupro Glow Peel"
  ],
  "DONGBANG MEDICAL": [
    "Elasty D",
    "Elasty F",
    "Elasty G",
    "Profhilo",
    "PILLA"
  ],
  "BIO|SCIENCE": [
    "BodyCountouring MLF 1"
  ],
  "APTOS": [
    "EVS",
    "LLL"
  ],
  "DEMULCENT": [
    "Collagen Solution type III",
    "Gouri",
    "Pluryal Silk",
    "Pluryal Mesoline",
    "Dermaheal SB",
    "Radiesse"
  ],
  "GUNA": [
    "MD-Muscle",
    "MD-Tissue",
    "NewU",
    "MCCM"
  ],
  "HYALUAL": [
    "Xela Rederm",
    "Electri"
  ],
  "AESTHETIC DERMAL": [
    "RRS Hyalift 75",
    "RRS XL Hair"
  ],
  "REVITACARE": [
    "Cytocare 520",
    "Cytocare 532",
    "Cytocare 640"
  ],
  "DIVES MED": [
    "Rich Hair",
    "Power Complex 06",
    "DrCyj",
    "Plinest Hair"
  ],
  "NEAUVIA": [
    "Neauvia Hydro Delux",
    "Neauvia Hydro Deluxe Man",
    "Ejal40",
    "Neobella"
  ],
  "SOFTFIL": [
    "Topilase",
    "Sunekos 200",
    "Sunekos 1200",
    "Sunekos Cell15"
  ],
  "INFINI": [
    "F5+",
    "V2",
    "V5",
    "V10",
    "V20",
    "Bio Age Peel"
  ],
  "SKYMEDIC": [
    "EXO OX",
    "NCTF 135 HA"
  ],
  "MESOESTETIC": [
    "C.PROF 210",
    "C.PROF 211",
    "C.PROF 213",
    "X.PROF 040"
  ],
  "NUCLEOFILL": [
    "Nucleofill Soft",
    "Nucleofill Strong",
    "Azzalure",
    "Reflydness",
    "Botox"
  ]
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function inferCatalogCategory(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("botox") || lower.includes("azzalure")) return "Toksyna botulinowa";
  if (lower.includes("peel")) return "Peeling";
  if (lower.includes("hair")) return "Trychologia";
  if (["evs", "lll"].includes(lower)) return "Nici";
  if (lower.includes("topilase")) return "Rozpuszczanie wypełniacza";
  if (lower.includes("radiesse") || lower.includes("gouri") || lower.includes("nucleofill") || lower.includes("plinest")) return "Biostymulator";
  if (lower.includes("sunekos") || lower.includes("jalupro") || lower.includes("cytocare") || lower.includes("nctf") || lower.includes("rrs") || lower.includes("xela") || lower.includes("c.prof") || lower.includes("x.prof") || lower.includes("mesoline") || lower.includes("dermaheal") || lower.includes("md-") || lower.includes("newu") || lower.includes("mccm") || lower.includes("electri") || lower.includes("exo ox")) return "Mezoterapia";
  return "Wypełniacz / preparat zabiegowy";
}

function inferUnit(name: string): UnitType {
  const lower = name.toLowerCase();
  if (lower.includes("botox") || lower.includes("azzalure")) return UnitType.BOTOX_UNIT;
  if (lower.includes("nctf") || lower.includes("cytocare") || lower.includes("rrs") || lower.includes("sunekos") || lower.includes("jalupro") || lower.includes("nucleofill") || lower.includes("xela") || lower.includes("drcyj") || lower.includes("plinest") || lower.includes("dermaheal") || lower.includes("mesoline")) return UnitType.AMPULE;
  return UnitType.UNIT;
}

function priceForIndex(index: number) {
  const purchase = 22000 + index * 850;
  const sale = Math.round(purchase * 1.38);
  return { purchase, sale };
}

async function main() {
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

  const mainWh = await prisma.warehouse.upsert({
    where: { id: "main-warehouse" },
    update: { name: "Magazyn główny - Grodzisk Mazowiecki", parentId: null },
    create: { id: "main-warehouse", name: "Magazyn główny - Grodzisk Mazowiecki" },
  });

  const treatmentWh = await prisma.warehouse.upsert({
    where: { id: "treatment-warehouse" },
    update: { name: "Gabinet zabiegowy - Grodzisk Mazowiecki", parentId: mainWh.id },
    create: { id: "treatment-warehouse", name: "Gabinet zabiegowy - Grodzisk Mazowiecki", parentId: mainWh.id },
  });

  let globalIndex = 0;

  for (const [manufacturer, products] of Object.entries(INVENTORY)) {
    for (const name of products) {
      globalIndex += 1;
      const productId = `seed-${slugify(manufacturer)}-${slugify(name)}`;
      const sku = `DC-${String(globalIndex).padStart(3, "0")}`;
      const { purchase, sale } = priceForIndex(globalIndex);
      const quantityMain = 2 + (globalIndex % 6);
      const quantityTreatment = globalIndex % 3;
      const expiryMonth = (globalIndex % 12) + 1;
      const expiryDay = ((globalIndex * 2) % 25) + 1;
      const expiryDate = new Date(Date.UTC(2027 + (globalIndex % 2), expiryMonth - 1, expiryDay));
      const batch = `LOT-${String(globalIndex).padStart(4, "0")}`;
      const status = quantityMain + quantityTreatment <= 2 ? "Niski stan" : expiryDate.getTime() < Date.UTC(2027, 0, 1) ? "Krótki termin" : "Dostępny";

      const product = await prisma.product.upsert({
        where: { id: productId },
        update: {
          category: ProductCategory.PREPARATION,
          name,
          sku,
          unit: inferUnit(name),
          manufacturer,
          catalogCategory: inferCatalogCategory(name),
          purchasePrice: purchase,
          salePrice: sale,
          isActive: true,
        },
        create: {
          id: productId,
          category: ProductCategory.PREPARATION,
          name,
          sku,
          unit: inferUnit(name),
          manufacturer,
          catalogCategory: inferCatalogCategory(name),
          purchasePrice: purchase,
          salePrice: sale,
          isActive: true,
        },
      });

      await prisma.stock.upsert({
        where: { productId_warehouseId: { productId: product.id, warehouseId: mainWh.id } },
        update: { quantity: quantityMain },
        create: { productId: product.id, warehouseId: mainWh.id, quantity: quantityMain },
      });

      await prisma.stock.upsert({
        where: { productId_warehouseId: { productId: product.id, warehouseId: treatmentWh.id } },
        update: { quantity: quantityTreatment },
        create: { productId: product.id, warehouseId: treatmentWh.id, quantity: quantityTreatment },
      });

      await prisma.productLot.upsert({
        where: { id: `lot-main-${slugify(manufacturer)}-${slugify(name)}` },
        update: {
          warehouseId: mainWh.id,
          batchNumber: batch,
          expiryDate,
          quantity: quantityMain,
          purchasePrice: purchase,
          salePrice: sale,
          status,
          location: "Grodzisk Mazowiecki",
          note: `Robocza seria dla produktu ${name}`,
        },
        create: {
          id: `lot-main-${slugify(manufacturer)}-${slugify(name)}`,
          productId: product.id,
          warehouseId: mainWh.id,
          batchNumber: batch,
          expiryDate,
          quantity: quantityMain,
          purchasePrice: purchase,
          salePrice: sale,
          status,
          location: "Grodzisk Mazowiecki",
          note: `Robocza seria dla produktu ${name}`,
        },
      });

      if (quantityTreatment > 0) {
        await prisma.productLot.upsert({
          where: { id: `lot-treatment-${slugify(manufacturer)}-${slugify(name)}` },
          update: {
            warehouseId: treatmentWh.id,
            batchNumber: `${batch}-A`,
            expiryDate,
            quantity: quantityTreatment,
            purchasePrice: purchase,
            salePrice: sale,
            status: quantityTreatment <= 1 ? "Niski stan" : "Dostępny",
            location: "Grodzisk Mazowiecki",
            note: `Robocza seria gabinetowa dla produktu ${name}`,
          },
          create: {
            id: `lot-treatment-${slugify(manufacturer)}-${slugify(name)}`,
            productId: product.id,
            warehouseId: treatmentWh.id,
            batchNumber: `${batch}-A`,
            expiryDate,
            quantity: quantityTreatment,
            purchasePrice: purchase,
            salePrice: sale,
            status: quantityTreatment <= 1 ? "Niski stan" : "Dostępny",
            location: "Grodzisk Mazowiecki",
            note: `Robocza seria gabinetowa dla produktu ${name}`,
          },
        });
      }
    }
  }

  console.log(`✅ Seed completed: ${globalIndex} produktów`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
