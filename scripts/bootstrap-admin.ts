// Jednorazowe założenie pierwszego administratora (audyt bezpieczeństwa, F-01).
//
//   npm run admin:bootstrap              -> login "admin"
//   npm run admin:bootstrap -- jkowalski -> własny login
//
// Działa tylko, gdy w bazie nie ma jeszcze ŻADNEGO konta ADMIN. Hasło jest
// losowe, wypisywane jednorazowo na konsolę i oznaczone jako tymczasowe —
// przy pierwszym logowaniu trzeba ustawić własne.

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const login = (process.argv[2] || "admin").trim();

  const existingAdmin = await prisma.user.findFirst({ where: { role: Role.ADMIN }, select: { login: true } });
  if (existingAdmin) {
    console.error(`❌ W bazie jest już administrator (login „${existingAdmin.login}”). Nic nie zmieniam.`);
    process.exitCode = 1;
    return;
  }
  if (await prisma.user.findUnique({ where: { login }, select: { id: true } })) {
    console.error(`❌ Login „${login}” jest już zajęty. Podaj inny: npm run admin:bootstrap -- <login>`);
    process.exitCode = 1;
    return;
  }

  const location = await prisma.location.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  if (!location) {
    console.error("❌ Brak aktywnej lokalizacji w bazie — najpierw utwórz lokalizację.");
    process.exitCode = 1;
    return;
  }

  const password = randomBytes(18).toString("base64url");
  await prisma.user.create({
    data: {
      login,
      name: "Administrator",
      role: Role.ADMIN,
      locationId: location.id,
      location: location.name,
      passwordHash: await bcrypt.hash(password, 12),
      mustChangePassword: true,
      isVisible: false,
      isAvailable: false,
    },
  });

  console.log("✅ Utworzono konto administratora.");
  console.log(`   Login:  ${login}`);
  console.log(`   Hasło tymczasowe (pokazywane tylko raz): ${password}`);
  console.log("   Przy pierwszym logowaniu system wymusi ustawienie własnego hasła.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
