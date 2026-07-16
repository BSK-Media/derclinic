"use client";

import * as React from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";

type UserOption = {
  id: string;
  name: string;
  login: string;
  role: "ADMIN" | "RECEPTION" | "SPECIALIST";
  avatarUrl: string | null;
};

const ROLE_LABELS: Record<UserOption["role"], string> = {
  ADMIN: "Administrator",
  RECEPTION: "Recepcja",
  SPECIALIST: "Pracownik",
};

function initials(name?: string | null) {
  return (name ?? "U")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function fileToCompressedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error("Plik jest za duży. Maksymalny rozmiar to 5 MB."));
      return;
    }
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      reject(new Error("Dozwolone formaty: PNG, JPG i WebP."));
      return;
    }

    const sourceUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(sourceUrl);
      const maxDimension = 512;
      const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Nie udało się przetworzyć zdjęcia."));
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      reject(new Error("Nie udało się wczytać zdjęcia."));
    };
    image.src = sourceUrl;
  });
}

function AvatarPreview({ name, avatarUrl }: { name?: string | null; avatarUrl?: string | null }) {
  return (
    <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-2xl font-semibold text-emerald-800 shadow-sm ring-4 ring-white dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-white/10">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name ?? "Zdjęcie profilowe"}
          className="h-full w-full object-cover"
        />
      ) : (
        initials(name)
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const [avatar, setAvatar] = React.useState<string | null>(null);
  const [avatarChanged, setAvatarChanged] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setAvatar(user?.avatarUrl ?? null);
    setAvatarChanged(false);
  }, [user?.avatarUrl]);

  async function chooseOwnAvatar(file: File | null) {
    if (!file) return;
    try {
      setAvatar(await fileToCompressedDataUrl(file));
      setAvatarChanged(true);
    } catch (error: any) {
      toast.error(error?.message || "Nie udało się wczytać zdjęcia.");
    }
  }

  async function saveOwnAvatar() {
    if (!avatarChanged || !avatar) return;
    setSaving(true);
    try {
      const response = await fetch("/api/me/avatar", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ avatarUrl: avatar }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        toast.error(result?.message || "Nie udało się zapisać zdjęcia.");
        return;
      }
      setAvatarChanged(false);
      await refresh();
      toast.success("Zdjęcie profilowe zostało zmienione.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Ustawienia</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Zarządzaj zdjęciem przypisanym do swojego konta.
        </p>
      </div>

      <section className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <AvatarPreview name={user?.name} avatarUrl={avatar} />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Twoje zdjęcie profilowe
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Po zapisaniu nowe zdjęcie będzie widoczne w całym systemie dla wszystkich uprawnionych
              użytkowników.
            </p>
            <p className="mt-1 text-xs text-slate-400">PNG, JPG lub WebP, maksymalnie 5 MB.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <label className="cursor-pointer rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10">
                Wybierz zdjęcie
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => chooseOwnAvatar(event.target.files?.[0] ?? null)}
                />
              </label>
              <button
                type="button"
                onClick={saveOwnAvatar}
                disabled={!avatarChanged || saving}
                className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Zapisywanie…" : "Zapisz zdjęcie"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {user?.role === "ADMIN" ? (
        <AdminAvatarManager currentUserId={user.id} onOwnAvatarChanged={refresh} />
      ) : null}
    </div>
  );
}

function AdminAvatarManager({
  currentUserId,
  onOwnAvatarChanged,
}: {
  currentUserId: string;
  onOwnAvatarChanged: () => Promise<void>;
}) {
  const [users, setUsers] = React.useState<UserOption[]>([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [avatar, setAvatar] = React.useState<string | null>(null);
  const [avatarChanged, setAvatarChanged] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const selectedUser = users.find((item) => item.id === selectedId);

  React.useEffect(() => {
    async function loadUsers() {
      setLoading(true);
      try {
        const response = await fetch("/api/admin/users", { cache: "no-store" });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result?.ok) setUsers(result.users ?? []);
      } finally {
        setLoading(false);
      }
    }
    loadUsers();
  }, []);

  function selectUser(id: string) {
    setSelectedId(id);
    setAvatar(users.find((item) => item.id === id)?.avatarUrl ?? null);
    setAvatarChanged(false);
  }

  async function chooseAvatar(file: File | null) {
    if (!file) return;
    try {
      setAvatar(await fileToCompressedDataUrl(file));
      setAvatarChanged(true);
    } catch (error: any) {
      toast.error(error?.message || "Nie udało się wczytać zdjęcia.");
    }
  }

  async function saveAvatar() {
    if (!selectedId || !avatarChanged || !avatar) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/users/${selectedId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ avatarUrl: avatar }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        toast.error(result?.message || "Nie udało się zapisać zdjęcia.");
        return;
      }
      setUsers((current) =>
        current.map((item) => (item.id === selectedId ? { ...item, avatarUrl: avatar } : item)),
      );
      setAvatarChanged(false);
      if (selectedId === currentUserId) await onOwnAvatarChanged();
      toast.success(`Zmieniono zdjęcie użytkownika ${selectedUser?.name ?? ""}.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Zdjęcia pozostałych użytkowników
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Administrator może zastąpić zdjęcie pracownika, recepcji lub innego administratora.
        </p>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Użytkownik
          </label>
          <select
            value={selectedId}
            onChange={(event) => selectUser(event.target.value)}
            disabled={loading}
            className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-300 dark:border-white/10 dark:bg-[#0b1220]"
          >
            <option value="">{loading ? "Ładowanie…" : "— wybierz użytkownika —"}</option>
            {users.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} — {ROLE_LABELS[item.role]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedUser ? (
        <div className="mt-6 flex flex-col gap-6 rounded-2xl border border-slate-100 bg-slate-50/70 p-5 dark:border-white/10 dark:bg-white/5 sm:flex-row sm:items-center">
          <AvatarPreview name={selectedUser.name} avatarUrl={avatar} />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-900 dark:text-white">{selectedUser.name}</div>
            <div className="text-sm text-slate-500">
              {ROLE_LABELS[selectedUser.role]} • {selectedUser.login}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <label className="cursor-pointer rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10">
                Wybierz nowe zdjęcie
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => chooseAvatar(event.target.files?.[0] ?? null)}
                />
              </label>
              <button
                type="button"
                onClick={saveAvatar}
                disabled={!avatarChanged || saving}
                className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Zapisywanie…" : "Zapisz zdjęcie"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
