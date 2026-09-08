import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";

// Ten sam kod co prisma/update-test-content.ts, tylko dostępny jako endpoint
// w panelu admina — dla wygody, gdy nie ma się lokalnego dostępu do bazy
// (praca wyłącznie przez przeglądarkę, bez terminala/Vercel CLI).
// Źródła treści (sparafrazowane, nie kopiowane 1:1):
//   https://derclinic.pl/medycyna-estetyczna/blefaroplastyka-powiek-gornych/
//   https://derclinic.pl/o-klinice/zespol/dr-marta-szyderska/

const SERVICE_NAME = "Blefaroplastyka powiek górnych";
const SPECIALIST_NAME = "Marta Szyderska";

const SERVICE_DESCRIPTION = `Opadające górne powieki to nie tylko kwestia wyglądu — nadmiar skóry potrafi ograniczać pole widzenia i sprawiać wrażenie zmęczenia nawet po dobrze przespanej nocy. Blefaroplastyka powiek górnych to zabieg chirurgiczny, który usuwa nadmiar skóry (a w razie potrzeby też tkankę tłuszczową) znad oka, przywracając bardziej wypoczęte i młodsze spojrzenie.

Zabieg wykonywany jest w znieczuleniu miejscowym i trwa około 2 godzin. Nacięcie prowadzone jest wzdłuż naturalnego fałdu powieki, dzięki czemu blizna po zagojeniu jest praktycznie niewidoczna.

Efekty: młodsze, bardziej otwarte spojrzenie, redukcja uczucia ciężkości powiek, poprawa symetrii oczu, a przy znaczącym opadaniu skóry — również poprawa pola widzenia. Pierwsze rezultaty widać od razu, pełny efekt kształtuje się w ciągu około miesiąca i utrzymuje się przez wiele lat.

Rekonwalescencja: przez pierwsze dni mogą pojawić się niewielkie obrzęki i zasinienia. Szwy usuwane są zwykle po tygodniu, a powrót do codziennych aktywności zajmuje 10–14 dni.

Zabiegu nie wykonuje się w ciąży i w trakcie karmienia piersią, przy aktywnych infekcjach w okolicy oczu oraz przy zaburzeniach krzepnięcia krwi — dokładną kwalifikację przeprowadza lekarz podczas konsultacji.`;

const SPECIALIST_BIO = `Marta Szyderska jest założycielką DerClinic oraz lekarzem medycyny estetycznej, w trakcie specjalizacji z chirurgii plastycznej. Jest absolwentką Wydziału Lekarskiego Uniwersytetu Medycznego w Łodzi, a swoje kwalifikacje uzupełniła studiami podyplomowymi z medycyny estetycznej i kosmetologii lekarskiej. W medycynie estetycznej pracuje od 9 lat.

W swojej praktyce łączy zabiegi z zakresu medycyny estetycznej — m.in. mezoterapię igłową, osocze bogatopłytkowe, peelingi chemiczne, wypełnianie kwasem hialuronowym, lipolizę iniekcyjną, nici liftingujące oraz toksynę botulinową — z zabiegami chirurgii plastycznej, takimi jak plastyka powiek górnych i dolnych, usuwanie zmian skórnych czy lipotransfer z komórkami macierzystymi. Zajmuje się też zabiegami z zakresu chirurgii odtwórczej włosów.

Należy do Polskiego Towarzystwa Medycyny Estetycznej i Anti-Aging, Polskiego Towarzystwa Lekarskiego oraz Polskiego Towarzystwa Chirurgii Plastycznej, Rekonstrukcyjnej i Estetycznej. Regularnie uczestniczy w kongresach branżowych, a sama prowadzi szkolenia dla lekarzy z zakresu wypełniaczy i stymulatorów tkankowych.`;

export async function POST() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const log: string[] = [];

  const service = await prisma.service.findFirst({ where: { name: SERVICE_NAME } });
  if (!service) {
    log.push(`Nie znaleziono usługi "${SERVICE_NAME}" — pominięto.`);
  } else {
    await prisma.service.update({ where: { id: service.id }, data: { description: SERVICE_DESCRIPTION } });
    log.push(`Zaktualizowano opis usługi "${SERVICE_NAME}".`);
  }

  const specialist = await prisma.user.findFirst({ where: { name: SPECIALIST_NAME, role: "SPECIALIST" } });
  if (!specialist) {
    log.push(`Nie znaleziono specjalisty "${SPECIALIST_NAME}" — pominięto.`);
  } else {
    await prisma.user.update({ where: { id: specialist.id }, data: { bio: SPECIALIST_BIO } });
    log.push(`Zaktualizowano biogram "${SPECIALIST_NAME}".`);
  }

  if (service && specialist) {
    const existingLink = await prisma.specialistService.findUnique({
      where: { specialistId_serviceId: { specialistId: specialist.id, serviceId: service.id } },
    });
    if (!existingLink) {
      await prisma.specialistService.create({ data: { specialistId: specialist.id, serviceId: service.id } });
      log.push(`Dodano powiązanie "${SPECIALIST_NAME}" ↔ "${SERVICE_NAME}".`);
    } else {
      log.push(`Powiązanie "${SPECIALIST_NAME}" ↔ "${SERVICE_NAME}" już istniało.`);
    }
  }

  return NextResponse.json({ ok: true, log });
}
