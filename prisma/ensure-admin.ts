import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "b.skladanek@bskmedia.pl";
  const plainPassword = "C3bee3ae!@#$";

  const passwordHash = await bcrypt.hash(plainPassword, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: "Bartek Składanek",
      role: Role.ADMIN,
      passwordHash,
      hourlyRateDefault: 0,
    },
    create: {
      name: "Bartek Składánek",
      email,
      role: Role.ADMIN,
      passwordHash,
      hourlyRateDefault: 0,
    },
  });

  console.log("Admin OK:", user.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
