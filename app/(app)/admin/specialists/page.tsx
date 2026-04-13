
"use client";

import useSWR from "swr";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Specialist = {
  id: string;
  specialistCode?: number | null;
  name: string;
  login: string;
  role: string;
  email?: string | null;
  phone?: string | null;
  isVisible: boolean;
  isAvailable: boolean;
  avatarUrl?: string | null;
  jobTitle?: string | null;
  sourceProfileUrl?: string | null;
};

function Avatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className="h-12 w-12 rounded-2xl object-cover ring-1 ring-black/5" />;
  }

  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-sm font-semibold text-emerald-800 ring-1 ring-black/5">
      {initials}
    </div>
  );
}

export default function SpecialistsPage() {
  const { data, mutate, isLoading } = useSWR("/api/admin/specialists", fetcher);
  const specialists: Specialist[] = data?.specialists ?? [];

  async function toggleField(id: string, patch: Partial<Pick<Specialist, "isVisible" | "isAvailable">>) {
    const res = await fetch(`/api/admin/specialists/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zapisać zmian");
    toast.success("Zapisano zmiany");
    mutate();
  }

  const visibleCount = specialists.filter((s) => s.isVisible).length;
  const availableCount = specialists.filter((s) => s.isAvailable).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Specjaliści</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Profile specjalistów i pracowników recepcji z gotowymi kontami logowania do panelu.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-sm text-slate-500">Łączna liczba profili</div>
          <div className="mt-2 text-3xl font-semibold">{specialists.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-slate-500">Widoczne profile</div>
          <div className="mt-2 text-3xl font-semibold">{visibleCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-slate-500">Aktualnie dostępni</div>
          <div className="mt-2 text-3xl font-semibold">{availableCount}</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b p-4">
          <div className="font-medium">Lista specjalistów</div>
          <div className="mt-1 text-xs text-slate-500">Każdy rekord ma utworzony login. Specjalista po zalogowaniu widzi własne wizyty w panelu specjalisty.</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 dark:bg-white/5">
              <tr>
                <th className="p-3">ID</th>
                <th className="p-3">Nazwa</th>
                <th className="p-3">Widoczność</th>
                <th className="p-3">Dostępność</th>
                <th className="p-3">Telefon</th>
                <th className="p-3">E-mail</th>
                <th className="p-3">Działania</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td className="p-4 text-slate-500" colSpan={7}>Ładowanie...</td></tr>
              )}
              {!isLoading && specialists.length === 0 && (
                <tr><td className="p-4 text-slate-500" colSpan={7}>Brak specjalistów.</td></tr>
              )}
              {specialists.map((s, index) => (
                <tr key={s.id} className="border-t align-top">
                  <td className="p-3 font-medium">{s.specialistCode ?? index + 1}</td>
                  <td className="p-3">
                    <div className="flex items-start gap-3">
                      <Avatar name={s.name} avatarUrl={s.avatarUrl} />
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white">{s.name}</div>
                        <div className="mt-1 text-xs text-slate-500">login: {s.login}</div>
                        {s.jobTitle ? <div className="mt-1 text-xs text-slate-500">{s.jobTitle}</div> : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge variant="secondary">{s.role === "RECEPTION" ? "Recepcja" : "Specjalista"}</Badge>
                          {s.sourceProfileUrl ? (
                            <a className="text-xs text-emerald-700 underline underline-offset-2" href={s.sourceProfileUrl} target="_blank" rel="noreferrer">
                              Profil źródłowy
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge className={s.isVisible ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-slate-200 text-slate-700 hover:bg-slate-200"}>
                      {s.isVisible ? "Widoczne" : "Ukryty"}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Badge className={s.isAvailable ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-amber-100 text-amber-800 hover:bg-amber-100"}>
                      {s.isAvailable ? "Dostępny" : "Niedostępny"}
                    </Badge>
                  </td>
                  <td className="p-3">{s.phone || "-"}</td>
                  <td className="p-3">{s.email || "-"}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => toggleField(s.id, { isVisible: !s.isVisible })}>
                        {s.isVisible ? "Ukryj" : "Pokaż"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => toggleField(s.id, { isAvailable: !s.isAvailable })}>
                        {s.isAvailable ? "Oznacz niedostępny" : "Oznacz dostępny"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
