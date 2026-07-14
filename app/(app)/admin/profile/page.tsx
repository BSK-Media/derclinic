"use client";

import * as React from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";

type EmployeeRow = {
  id: string;
  login: string;
  name: string;
  role: "ADMIN" | "RECEPTION" | "SPECIALIST";
  location: string | null;
  specialization: string | null;
  avatarUrl: string | null;
};

function splitName(full: string | null | undefined): { firstName: string; lastName: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

const fieldLabelCls = "block text-sm font-semibold text-slate-800 dark:text-slate-200";
const readOnlyCls =
  "mt-1 flex h-11 w-full items-center rounded-2xl border border-white/60 bg-slate-100/70 px-4 text-sm text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-200";
const inputCls =
  "mt-1 h-11 w-full rounded-2xl border border-white/60 bg-white/70 px-4 text-sm shadow-sm outline-none focus:border-emerald-300 dark:border-white/10 dark:bg-[#0b1220]/55";
const cardCls =
  "rounded-2xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55";

export default function ProfilePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const me = splitName(user?.name);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Profil użytkownika</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Dane profilu są przypisane przez administratora i nie podlegają samodzielnej edycji.
        </p>
      </div>

      {/* Profil zalogowanego użytkownika — tylko do odczytu */}
      <div className={cardCls}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="flex items-center gap-4 sm:w-[220px] sm:flex-col sm:items-start">
            <div className="h-20 w-20 overflow-hidden rounded-full bg-slate-200 ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
              <img
                src={user?.avatarUrl ?? "/demo-avatar-ewa.svg"}
                alt="Avatar"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Zdjęcie profilowe</div>
          </div>

          <div className="grid flex-1 gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={fieldLabelCls}>Imię</label>
                <div className={readOnlyCls}>{me.firstName || "—"}</div>
              </div>
              <div>
                <label className={fieldLabelCls}>Nazwisko</label>
                <div className={readOnlyCls}>{me.lastName || "—"}</div>
              </div>
            </div>

            <div>
              <label className={fieldLabelCls}>Lokalizacja</label>
              <div className={readOnlyCls}>{user?.location || "—"}</div>
            </div>

            <div>
              <label className={fieldLabelCls}>Specjalizacja</label>
              <div className={readOnlyCls}>{user?.specialization || "—"}</div>
            </div>
          </div>
        </div>
      </div>

      {isAdmin ? <AdminEmployeeEditor /> : null}
    </div>
  );
}

function AdminEmployeeEditor() {
  const [employees, setEmployees] = React.useState<EmployeeRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedId, setSelectedId] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [specialization, setSpecialization] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json().catch(() => ({ ok: false }));
      if (data?.ok) setEmployees(data.users as EmployeeRow[]);
      else toast.error("Nie udało się pobrać listy pracowników.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  function onSelect(id: string) {
    setSelectedId(id);
    const emp = employees.find((e) => e.id === id);
    if (!emp) {
      setFirstName("");
      setLastName("");
      setLocation("");
      setSpecialization("");
      return;
    }
    const n = splitName(emp.name);
    setFirstName(n.firstName);
    setLastName(n.lastName);
    setLocation(emp.location ?? "");
    setSpecialization(emp.specialization ?? "");
  }

  async function onSave() {
    if (!selectedId) return;
    const name = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
    if (name.length < 2) {
      toast.error("Podaj imię i nazwisko.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, location, specialization }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (data?.ok) {
        toast.success("Zapisano zmiany pracownika.");
        // odśwież lokalną listę, żeby ponowny wybór pokazał aktualne dane
        setEmployees((prev) =>
          prev.map((e) => (e.id === selectedId ? { ...e, name, location, specialization } : e))
        );
      } else {
        toast.error(data?.message || "Nie udało się zapisać zmian.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cardCls}>
      <div className="text-base font-semibold">Edycja danych pracowników</div>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        Widoczne tylko dla administratora. Wybierz pracownika z listy, aby edytować jego dane profilowe.
      </p>

      <div className="mt-4 grid gap-4">
        <div>
          <label className={fieldLabelCls}>Pracownik</label>
          <select
            value={selectedId}
            onChange={(e) => onSelect(e.target.value)}
            disabled={loading}
            className={inputCls}
          >
            <option value="">{loading ? "Ładowanie..." : "— wybierz pracownika —"}</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.role})
              </option>
            ))}
          </select>
        </div>

        {selectedId ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={fieldLabelCls}>Imię</label>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={fieldLabelCls}>Nazwisko</label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} />
              </div>
            </div>

            <div>
              <label className={fieldLabelCls}>Lokalizacja</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} />
            </div>

            <div>
              <label className={fieldLabelCls}>Specjalizacja</label>
              <input
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                className={inputCls}
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={onSave}
                disabled={saving}
                className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
              >
                {saving ? "Zapisywanie..." : "Zapisz zmiany"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
