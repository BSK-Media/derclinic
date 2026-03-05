"use client";

import * as React from "react";

type ProfileState = {
  firstName: string;
  lastName: string;
  address: string;
  profession: string;
  bio: string;
  avatarDataUrl: string | null;
};

export default function ProfilePage() {
  const [state, setState] = React.useState<ProfileState>({
    firstName: "Ewa",
    lastName: "Kowalska",
    address: "",
    profession: "Lekarz",
    bio: "",
    avatarDataUrl: "/demo-avatar-ewa.svg",
  });

  function onChange<K extends keyof ProfileState>(key: K, val: ProfileState[K]) {
    setState((s) => ({ ...s, [key]: val }));
  }

  async function onFile(file: File | null) {
    if (!file) return;
    const max = 3 * 1024 * 1024; // 3MB
    if (file.size > max) {
      alert("Plik jest za duży. Maksymalnie 3MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange("avatarDataUrl", String(reader.result));
    reader.readAsDataURL(file);
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Profil użytkownika</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Uzupełnij dane profilu. Zdjęcie będzie używane jako miniaturka w nagłówku.
        </p>
      </div>

      <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="flex items-center gap-4 sm:w-[260px] sm:flex-col sm:items-start">
            <div className="h-20 w-20 overflow-hidden rounded-full bg-slate-200 ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
              <img
                src={state.avatarDataUrl ?? "/demo-avatar-ewa.svg"}
                alt="Avatar"
                className="h-full w-full object-cover"
              />
            </div>

            <div className="flex-1 sm:w-full">
              <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                Zdjęcie profilowe
              </label>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                PNG/JPG/WebP, max 3MB.
              </p>
              <input
                type="file"
                accept="image/*"
                className="mt-2 block w-full text-sm"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="grid flex-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-1">
              <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">Imię</label>
              <input
                value={state.firstName}
                onChange={(e) => onChange("firstName", e.target.value)}
                className="mt-1 h-11 w-full rounded-2xl border border-white/60 bg-white/70 px-4 text-sm shadow-sm outline-none ring-0 focus:border-emerald-300 dark:border-white/10 dark:bg-[#0b1220]/55"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">Nazwisko</label>
              <input
                value={state.lastName}
                onChange={(e) => onChange("lastName", e.target.value)}
                className="mt-1 h-11 w-full rounded-2xl border border-white/60 bg-white/70 px-4 text-sm shadow-sm outline-none focus:border-emerald-300 dark:border-white/10 dark:bg-[#0b1220]/55"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">Adres</label>
              <input
                value={state.address}
                onChange={(e) => onChange("address", e.target.value)}
                placeholder="np. ul. Przykładowa 10, Warszawa"
                className="mt-1 h-11 w-full rounded-2xl border border-white/60 bg-white/70 px-4 text-sm shadow-sm outline-none focus:border-emerald-300 dark:border-white/10 dark:bg-[#0b1220]/55"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">Zawód</label>
              <input
                value={state.profession}
                onChange={(e) => onChange("profession", e.target.value)}
                placeholder="np. Lekarz, Kosmetolog"
                className="mt-1 h-11 w-full rounded-2xl border border-white/60 bg-white/70 px-4 text-sm shadow-sm outline-none focus:border-emerald-300 dark:border-white/10 dark:bg-[#0b1220]/55"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">Opis</label>
              <textarea
                value={state.bio}
                onChange={(e) => onChange("bio", e.target.value)}
                placeholder="Krótki opis..."
                className="mt-1 min-h-[120px] w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-sm shadow-sm outline-none focus:border-emerald-300 dark:border-white/10 dark:bg-[#0b1220]/55"
              />
            </div>

            <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-3 pt-2">
              <button
                type="button"
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                onClick={() => alert("Zapis placeholder — podłączymy API później.")}
              >
                Zapisz zmiany
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
