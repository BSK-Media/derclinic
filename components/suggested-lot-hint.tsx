// Sugestia, którą partię sugerowanego preparatu zużyć: najkrótszy termin ważności pierwszy.
type SuggestedLot = {
  id: string;
  batchNumber: string;
  serialNumber: string | null;
  expiryDate: string | null;
  quantity: number;
  warehouseName: string;
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("pl-PL") : "bez terminu";
}

export function SuggestedLotHint({ lots }: { lots?: SuggestedLot[] }) {
  if (!lots || lots.length === 0) {
    return <div className="text-[11px] text-red-600">Brak partii na stanie w magazynach tej lokalizacji.</div>;
  }
  const [first, ...rest] = lots;
  return (
    <div className="mt-1 text-[11px] leading-snug">
      <div className="font-medium text-emerald-700 dark:text-emerald-300">
        Użyj partii {first.batchNumber}
        {first.serialNumber ? ` (nr ser. ${first.serialNumber})` : ""} — ważna do {formatDate(first.expiryDate)} ·{" "}
        {first.warehouseName} · zostało {first.quantity}
      </div>
      {rest.length > 0 ? (
        <div className="text-zinc-500">
          Następne:{" "}
          {rest
            .slice(0, 3)
            .map((lot) => `${lot.batchNumber} (do ${formatDate(lot.expiryDate)})`)
            .join(", ")}
          {rest.length > 3 ? ` i ${rest.length - 3} więcej` : ""}
        </div>
      ) : null}
    </div>
  );
}
