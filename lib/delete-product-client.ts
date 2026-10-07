// Trwałe usunięcie produktu z katalogu (wszystkie magazyny). Serwer odmawia, gdy produkt
// był użyty w wizytach lub sprzedaży — wtedy zwracamy jego komunikat.
export async function deleteProductRequest(productId: string): Promise<{ ok: boolean; message?: string }> {
  const response = await fetch(`/api/admin/products/${encodeURIComponent(productId)}`, { method: "DELETE" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.ok) return { ok: false, message: result?.message || "Nie udało się usunąć produktu" };
  return { ok: true };
}

export function deleteProductConfirmMessage(name: string) {
  return `Trwale usunąć produkt „${name}” z katalogu?\n\nZniknie ze wszystkich magazynów razem ze stanami i partiami oraz z listy preparatów przypisanych do zabiegów. Tej operacji nie można cofnąć. Jeśli produkt był już używany przy wizytach lub sprzedaży, system go nie usunie — wtedy ustaw go jako nieaktywny.`;
}
