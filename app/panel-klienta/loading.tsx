import Image from "next/image";
import { PatientBottomNav } from "@/components/patient-bottom-nav";

// Szkielet pokazywany natychmiast po kliknięciu linku w panelu klienta
// (karta wizyty, opis zabiegu, profil specjalisty, powrót do panelu), zanim
// serwer odeśle właściwą stronę. Bez niego ekran przez chwilę nie reagował
// i wyglądało to jak nietrafione kliknięcie. Układ naśladuje PatientPageShell,
// a dolna nawigacja PWA zostaje na miejscu, żeby nic nie skakało.
export default function PatientPanelLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 lg:flex">
      <aside className="hidden w-[264px] shrink-0 border-r border-zinc-200 bg-white/70 lg:fixed lg:left-0 lg:top-0 lg:block lg:h-screen" />

      <div className="flex-1 lg:ml-[264px]">
        <header className="border-b border-zinc-200 bg-white pt-[env(safe-area-inset-top)]">
          <div className="relative flex items-center justify-between px-4 py-3.5 sm:px-6">
            <div className="h-9 w-24 animate-pulse rounded-xl bg-zinc-100" />
            <span className="absolute left-1/2 top-1/2 block h-8 w-8 -translate-x-1/2 -translate-y-1/2 lg:hidden">
              <Image src="/derclinic-logo.webp" alt="DerClinic" fill className="object-contain" />
            </span>
            <div className="h-9 w-11 animate-pulse rounded-xl bg-zinc-100" />
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8" aria-busy="true" aria-label="Wczytywanie">
          <div className="animate-pulse">
            <div className="h-4 w-32 rounded bg-zinc-200" />
            <div className="mt-6 h-7 w-2/3 rounded-lg bg-zinc-200" />
            <div className="mt-3 h-4 w-1/2 rounded bg-zinc-200" />
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="h-40 rounded-2xl border border-zinc-200 bg-white" />
              <div className="h-40 rounded-2xl border border-zinc-200 bg-white" />
            </div>
            <div className="mt-6 h-32 rounded-2xl border border-zinc-200 bg-white" />
          </div>
        </main>
      </div>

      <PatientBottomNav mode="links" />
    </div>
  );
}
