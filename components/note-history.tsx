"use client";

import * as React from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

// Poprzednie treści notatki (wersje zapisywane przy każdej zmianie).
export function NoteHistory({ entity, id }: { entity: "APPOINTMENT" | "PATIENT"; id: string }) {
  const [open, setOpen] = React.useState(false);
  const { data } = useSWR(open ? `/api/admin/note-versions?entity=${entity}&id=${encodeURIComponent(id)}` : null, fetcher);
  const versions: { id: string; createdAt: string; note: string; changedBy: string | null }[] = data?.versions ?? [];

  return (
    <div className="text-xs">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-zinc-500 underline underline-offset-2">
        {open ? "Ukryj historię notatki" : "Historia notatki (poprzednie wersje)"}
      </button>
      {open ? (
        <ul className="mt-2 space-y-2">
          {data && versions.length === 0 ? <li className="text-zinc-500">Notatka nie była jeszcze zmieniana.</li> : null}
          {versions.map((version) => (
            <li key={version.id} className="rounded-lg border p-2">
              <div className="text-zinc-500">
                Zastąpiona {new Date(version.createdAt).toLocaleString("pl-PL")}
                {version.changedBy ? ` przez ${version.changedBy}` : ""}:
              </div>
              <div className="mt-1 whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">{version.note}</div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
