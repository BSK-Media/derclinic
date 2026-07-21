"use client";

import * as React from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { LocationSelect } from "@/components/location-select";

type RoleT = "ADMIN" | "RECEPTION" | "SPECIALIST";

type EmployeeRow = {
  id: string;
  login: string;
  name: string;
  role: RoleT;
  location: string | null;
  locationId: string;
  specialization: string | null;
  avatarUrl: string | null;
};

function splitName(full: string | null | undefined): { firstName: string; lastName: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** Wczytuje plik obrazu, skaluje do max 512px i zwraca skompresowany data URL (JPEG). */
function fileToCompressedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) return reject(new Error("Plik jest za duży. Maksymalnie 5MB."));
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) return reject(new Error("Dozwolone formaty: PNG, JPG, WebP."));

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 512;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Nie udało się przetworzyć obrazu."));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Nie udało się wczytać obrazu."));
    };
    img.src = url;
  });
}

const fieldLabelCls = "block text-sm font-semibold text-slate-800 dark:text-slate-200";
const readOnlyCls =
  "mt-1 flex h-11 w-full items-center rounded-2xl border border-white/60 bg-slate-100/70 px-4 text-sm text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-200";
const inputCls =
  "mt-1 h-11 w-full rounded-2xl border border-white/60 bg-white/70 px-4 text-sm shadow-sm outline-none focus:border-emerald-300 dark:border-white/10 dark:bg-[#0b1220]/55";
const cardCls =
  "rounded-2xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55";
const primaryBtnCls =
  "rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60";
const dangerBtnCls =
  "rounded-full border border-red-200 bg-red-50 px-6 py-3 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-100 disabled:opacity-60 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20";
const secondaryBtnCls =
  "rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10";

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

      {isAdmin ? <AdminEmployeeEditor myId={user!.id} /> : null}
    </div>
  );
}

function AdminEmployeeEditor({ myId }: { myId: string }) {
  const [employees, setEmployees] = React.useState<EmployeeRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedId, setSelectedId] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [showCreate, setShowCreate] = React.useState(false);

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [locationId, setLocationId] = React.useState("");
  const [specialization, setSpecialization] = React.useState("");
  const [avatar, setAvatar] = React.useState<string | null>(null); // aktualne lub nowo wybrane zdjęcie
  const [avatarChanged, setAvatarChanged] = React.useState(false);

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

  function fillForm(emp: EmployeeRow | undefined) {
    const n = splitName(emp?.name);
    setFirstName(n.firstName);
    setLastName(n.lastName);
    setLocationId(emp?.locationId ?? "");
    setSpecialization(emp?.specialization ?? "");
    setAvatar(emp?.avatarUrl ?? null);
    setAvatarChanged(false);
  }

  function onSelect(id: string) {
    setSelectedId(id);
    setShowCreate(false);
    fillForm(employees.find((e) => e.id === id));
  }

  async function onPickAvatar(file: File | null) {
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      setAvatar(dataUrl);
      setAvatarChanged(true);
    } catch (e: any) {
      toast.error(e?.message || "Nie udało się wczytać zdjęcia.");
    }
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
      if (!locationId) return toast.error("Wybierz lokalizację pracownika.");
      const body: Record<string, unknown> = { name, locationId, specialization };
      if (avatarChanged) body.avatarUrl = avatar ?? "";
      const res = await fetch(`/api/admin/users/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (data?.ok) {
        toast.success("Zapisano zmiany pracownika.");
        setAvatarChanged(false);
        setEmployees((prev) =>
          prev.map((e) => (e.id === selectedId ? { ...e, ...data.user, name, specialization, avatarUrl: avatar } : e))
        );
      } else {
        toast.error(data?.message || "Nie udało się zapisać zmian.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!selectedId) return;
    const emp = employees.find((e) => e.id === selectedId);
    if (!emp) return;
    if (emp.id === myId) {
      toast.error("Nie możesz usunąć własnego konta.");
      return;
    }
    const sure = window.confirm(
      `Czy na pewno chcesz trwale usunąć pracownika "${emp.name}" (login: ${emp.login})? Tej operacji nie można cofnąć.`
    );
    if (!sure) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({ ok: false }));
      if (data?.ok) {
        toast.success("Pracownik został usunięty.");
        setEmployees((prev) => prev.filter((e) => e.id !== selectedId));
        setSelectedId("");
        fillForm(undefined);
      } else {
        toast.error(data?.message || "Nie udało się usunąć pracownika.");
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={cardCls}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold">Edycja danych pracowników</div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Widoczne tylko dla administratora. Wszystkie zmiany są zapisywane trwale.
          </p>
        </div>
        <button
          onClick={() => {
            setShowCreate((v) => !v);
            setSelectedId("");
            fillForm(undefined);
          }}
          className={secondaryBtnCls}
        >
          {showCreate ? "Anuluj dodawanie" : "+ Dodaj pracownika"}
        </button>
      </div>

      {showCreate ? (
        <CreateEmployeeForm
          onCreated={(emp) => {
            setEmployees((prev) => [...prev, emp]);
            setShowCreate(false);
            setSelectedId(emp.id);
            fillForm(emp);
          }}
        />
      ) : (
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
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-slate-200 ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
                  {avatar ? (
                    <img src={avatar} alt="Zdjęcie pracownika" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">brak</div>
                  )}
                </div>
                <div>
                  <label className={fieldLabelCls}>Zdjęcie pracownika</label>
                  <p className="text-xs text-slate-500 dark:text-slate-400">PNG/JPG/WebP, max 5MB.</p>
                  <label className={"mt-2 inline-block cursor-pointer " + secondaryBtnCls}>
                    Zmień zdjęcie
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => onPickAvatar(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
              </div>

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
                <LocationSelect value={locationId} onChange={setLocationId} className={inputCls} />
              </div>

              <div>
                <label className={fieldLabelCls}>Specjalizacja</label>
                <input
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div className="flex flex-wrap justify-end gap-3">
                <button onClick={onDelete} disabled={deleting || saving} className={dangerBtnCls}>
                  {deleting ? "Usuwanie..." : "Usuń pracownika"}
                </button>
                <button onClick={onSave} disabled={saving || deleting} className={primaryBtnCls}>
                  {saving ? "Zapisywanie..." : "Zapisz zmiany"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CreateEmployeeForm({ onCreated }: { onCreated: (emp: EmployeeRow) => void }) {
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [login, setLogin] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<RoleT>("SPECIALIST");
  const [locationId, setLocationId] = React.useState("grodzisk-mazowiecki");
  const [specialization, setSpecialization] = React.useState("");
  const [avatar, setAvatar] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function onPickAvatar(file: File | null) {
    if (!file) return;
    try {
      setAvatar(await fileToCompressedDataUrl(file));
    } catch (e: any) {
      toast.error(e?.message || "Nie udało się wczytać zdjęcia.");
    }
  }

  async function onCreate() {
    const name = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
    if (name.length < 2) return toast.error("Podaj imię i nazwisko.");
    if (login.trim().length < 2) return toast.error("Podaj login (min. 2 znaki).");
    if (password.length < 4) return toast.error("Podaj hasło (min. 4 znaki).");

    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: login.trim(),
          name,
          role,
          password,
          locationId,
          specialization,
          avatarUrl: avatar ?? "",
        }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (data?.ok) {
        toast.success("Dodano pracownika.");
        onCreated(data.user as EmployeeRow);
      } else {
        toast.error(data?.message || "Nie udało się dodać pracownika (login może być zajęty).");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 grid gap-4 rounded-2xl border border-emerald-200/60 bg-emerald-50/40 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/5">
      <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Nowy pracownik</div>

      <div className="flex items-center gap-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-slate-200 ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
          {avatar ? (
            <img src={avatar} alt="Zdjęcie nowego pracownika" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">brak</div>
          )}
        </div>
        <div>
          <label className={fieldLabelCls}>Zdjęcie (opcjonalne)</label>
          <p className="text-xs text-slate-500 dark:text-slate-400">PNG/JPG/WebP, max 5MB.</p>
          <label className={"mt-2 inline-block cursor-pointer " + secondaryBtnCls}>
            Wybierz zdjęcie
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => onPickAvatar(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      </div>

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

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={fieldLabelCls}>Login</label>
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="np. jan.kowalski"
            className={inputCls}
          />
        </div>
        <div>
          <label className={fieldLabelCls}>Hasło startowe</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={fieldLabelCls}>Rola</label>
        <select value={role} onChange={(e) => setRole(e.target.value as RoleT)} className={inputCls}>
          <option value="SPECIALIST">Specjalista</option>
          <option value="RECEPTION">Recepcja</option>
          <option value="ADMIN">Administrator</option>
        </select>
      </div>

      <div>
        <label className={fieldLabelCls}>Lokalizacja</label>
        <LocationSelect value={locationId} onChange={setLocationId} className={inputCls} />
      </div>

      <div>
        <label className={fieldLabelCls}>Specjalizacja</label>
        <input value={specialization} onChange={(e) => setSpecialization(e.target.value)} className={inputCls} />
      </div>

      <div className="flex justify-end">
        <button onClick={onCreate} disabled={saving} className={primaryBtnCls}>
          {saving ? "Dodawanie..." : "Dodaj pracownika"}
        </button>
      </div>
    </div>
  );
}
