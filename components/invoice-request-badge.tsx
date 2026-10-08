// Znacznik "Faktura" przy wizycie, na którą klient poprosił o fakturę (dane nabywcy na karcie wizyty).
export function InvoiceRequestBadge({ requested }: { requested?: boolean | null }) {
  if (!requested) return null;
  return (
    <span
      title="Klient prosi o fakturę"
      className="ml-2 inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:bg-sky-500/15 dark:text-sky-200"
    >
      Faktura
    </span>
  );
}
