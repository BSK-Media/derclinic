"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useConfirm } from "@/components/confirm-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type MedicalPhoto = {
  key: string;
  appointmentId: string;
  slot: "before" | "after";
  takenAt: string;
  patientId: string;
  patientName: string;
  serviceName: string;
};
type NewsletterPhoto = {
  id: string;
  createdAt: string;
  size: number;
  mimeType: string;
  usedIn: { id: string; subject: string }[];
};
type AvatarPhoto = { id: string; name: string; role: string; login: string };

type Filter = "all" | "medical" | "newsletter" | "avatars";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrator",
  MANAGER: "Manager",
  RECEPTION: "Recepcja",
  SPECIALIST: "Specjalista",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" });
}

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const TILE = "overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-[#0b1220]";

// Galeria zdjęć (tylko administrator): przegląd wszystkich zdjęć w systemie i
// usuwanie tych, które nie są dokumentacją medyczną. Zdjęcia przed/po zabiegu
// są oznaczone kłódką i nie mają przycisku usuwania — serwer też nie udostępnia
// dla nich żadnej operacji usunięcia.
export default function GalleryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const confirm = useConfirm();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [preview, setPreview] = React.useState<{ src: string; title: string } | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!loading && user && user.role !== "ADMIN") router.replace("/admin/settings");
  }, [loading, user, router]);

  const { data, mutate, isLoading } = useSWR(user?.role === "ADMIN" ? "/api/admin/gallery" : null, fetcher);
  const medical: MedicalPhoto[] = data?.medical ?? [];
  const newsletter: NewsletterPhoto[] = data?.newsletter ?? [];
  const avatars: AvatarPhoto[] = data?.avatars ?? [];

  async function removeNewsletter(image: NewsletterPhoto) {
    const used = image.usedIn.length
      ? `\n\nZdjęcie jest użyte w wiadomościach: ${image.usedIn.map((c) => `„${c.subject}”`).join(", ")}. Po usunięciu przestanie się w nich wyświetlać — także w już wysłanych mailach.`
      : "";
    const ok = await confirm({
      title: "Usunąć zdjęcie?",
      message: `Zdjęcie z newslettera zostanie usunięte bezpowrotnie.${used}`,
      confirmLabel: "Usuń zdjęcie",
      destructive: true,
    });
    if (!ok) return;
    await runDelete(image.id, `/api/admin/gallery/newsletter/${image.id}`);
  }

  async function removeAvatar(avatar: AvatarPhoto) {
    const ok = await confirm({
      title: "Usunąć zdjęcie profilowe?",
      message: `Zdjęcie profilowe pracownika „${avatar.name}” zostanie usunięte. Konto zostaje — wróci domyślny awatar.`,
      confirmLabel: "Usuń zdjęcie",
      destructive: true,
    });
    if (!ok) return;
    await runDelete(avatar.id, `/api/admin/gallery/avatar/${avatar.id}`);
  }

  async function runDelete(id: string, url: string) {
    setBusyId(id);
    try {
      const res = await fetch(url, { method: "DELETE" });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się usunąć zdjęcia.");
      toast.success("Zdjęcie usunięte");
      await mutate();
    } finally {
      setBusyId(null);
    }
  }

  if (loading || !user || user.role !== "ADMIN") return null;

  const show = (kind: Exclude<Filter, "all">) => filter === "all" || filter === kind;
  const filters: { value: Filter; label: string; count?: number }[] = [
    { value: "all", label: "Wszystkie" },
    { value: "medical", label: "Dokumentacja medyczna", count: data?.medicalTotal },
    { value: "newsletter", label: "Newsletter", count: newsletter.length },
    { value: "avatars", label: "Zdjęcia profilowe", count: avatars.length },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link href="/admin/settings" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-white">
          ← Ustawienia
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Galeria zdjęć</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Wszystkie zdjęcia w systemie. Zdjęcia przed i po zabiegu to dokumentacja medyczna — są tu tylko do podglądu
          i nie można ich usunąć. Pozostałe (newsletter, zdjęcia profilowe) możesz usuwać.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={
              "rounded-full border px-3.5 py-2 text-sm font-medium " +
              (filter === item.value
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
                : "bg-white text-zinc-600 dark:bg-[#0b1220] dark:text-zinc-300")
            }
          >
            {item.label}
            {item.count !== undefined ? ` (${item.count})` : ""}
          </button>
        ))}
      </div>

      {isLoading ? <div className="text-sm text-zinc-500">Ładowanie…</div> : null}

      {show("medical") ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Dokumentacja medyczna — zdjęcia przed/po</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
              <Lock className="h-3 w-3" /> nie można usunąć
            </span>
          </div>
          {data && data.medicalTotal > medical.length ? (
            <p className="text-xs text-zinc-500">
              Pokazano najnowsze {medical.length} z {data.medicalTotal} zdjęć.
            </p>
          ) : null}
          {!isLoading && medical.length === 0 ? <div className="text-sm text-zinc-500">Brak zdjęć z wizyt.</div> : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {medical.map((photo) => {
              const src = `/api/admin/gallery/medical/${photo.appointmentId}?slot=${photo.slot}`;
              const label = photo.slot === "before" ? "Przed" : "Po";
              return (
                <div key={photo.key} className={TILE}>
                  <button
                    type="button"
                    onClick={() => setPreview({ src, title: `${photo.patientName} — ${photo.serviceName} (${label})` })}
                    className="relative block aspect-square w-full bg-zinc-100"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`${label}: ${photo.patientName}`} loading="lazy" className="h-full w-full object-cover" />
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
                      <Lock className="h-3 w-3" /> {label}
                    </span>
                  </button>
                  <div className="space-y-0.5 p-2.5 text-xs">
                    <Link href={`/admin/patients/${photo.patientId}`} className="block truncate font-medium hover:underline">
                      {photo.patientName}
                    </Link>
                    <Link href={`/admin/appointments/${photo.appointmentId}`} className="block truncate text-zinc-500 hover:underline">
                      {photo.serviceName} · {formatDate(photo.takenAt)}
                    </Link>
                    <div className="pt-1 text-[11px] text-amber-700">Dokumentacja medyczna</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {show("newsletter") ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Zdjęcia z newslettera</h2>
          {!isLoading && newsletter.length === 0 ? (
            <div className="text-sm text-zinc-500">Nie wgrano jeszcze żadnych zdjęć do newslettera.</div>
          ) : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {newsletter.map((image) => {
              const src = `/api/newsletter/images/${image.id}`;
              return (
                <div key={image.id} className={TILE}>
                  <button
                    type="button"
                    onClick={() => setPreview({ src, title: "Zdjęcie z newslettera" })}
                    className="block aspect-square w-full bg-zinc-100"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="Zdjęcie z newslettera" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                  <div className="space-y-1 p-2.5 text-xs">
                    <div className="text-zinc-500">
                      {formatDate(image.createdAt)} · {formatSize(image.size)}
                    </div>
                    <div className={image.usedIn.length ? "text-zinc-700" : "text-zinc-400"}>
                      {image.usedIn.length
                        ? `Użyte w: ${image.usedIn.map((c) => c.subject).join(", ")}`
                        : "Nieużywane w wiadomościach"}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === image.id}
                      onClick={() => removeNewsletter(image)}
                      className="mt-1 w-full text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Usuń
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {show("avatars") ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Zdjęcia profilowe pracowników</h2>
          {!isLoading && avatars.length === 0 ? <div className="text-sm text-zinc-500">Brak zdjęć profilowych.</div> : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {avatars.map((avatar) => {
              const src = `/api/admin/gallery/avatar/${avatar.id}`;
              return (
                <div key={avatar.id} className={TILE}>
                  <button
                    type="button"
                    onClick={() => setPreview({ src, title: avatar.name })}
                    className="block aspect-square w-full bg-zinc-100"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={avatar.name} loading="lazy" className="h-full w-full object-cover" />
                  </button>
                  <div className="space-y-1 p-2.5 text-xs">
                    <div className="truncate font-medium">{avatar.name}</div>
                    <div className="text-zinc-500">{ROLE_LABELS[avatar.role] ?? avatar.role}</div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === avatar.id}
                      onClick={() => removeAvatar(avatar)}
                      className="mt-1 w-full text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Usuń
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <Dialog open={preview !== null} onOpenChange={(open) => (!open ? setPreview(null) : undefined)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{preview?.title}</DialogTitle>
          </DialogHeader>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.src} alt={preview.title} className="max-h-[70vh] w-full rounded-xl object-contain" />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
