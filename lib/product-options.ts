export const BUILTIN_UNITS = [
  { value: "UNIT", label: "szt." },
  { value: "ML", label: "ml" },
  { value: "MG", label: "mg" },
  { value: "G", label: "g" },
  { value: "AMPULE", label: "ampułka" },
  { value: "BOTOX_UNIT", label: "jednostka botoksu" },
] as const;

const CUSTOM_PREFIX = "custom:";

export type ProductOptions = {
  categories: { id: string | null; name: string }[];
  units: { id: string; name: string }[];
};

/** Wartość pola wyboru jednostki: wbudowana (np. "ML") albo własna ("custom:Nazwa"). */
export function unitSelectValue(unit: string | null | undefined, customUnit?: string | null) {
  return customUnit ? `${CUSTOM_PREFIX}${customUnit}` : (unit ?? "UNIT");
}

/** Odwrotność unitSelectValue — pola do wysłania do API. */
export function unitFromSelectValue(value: string): { unit: string; customUnit: string | null } {
  return value.startsWith(CUSTOM_PREFIX)
    ? { unit: "UNIT", customUnit: value.slice(CUSTOM_PREFIX.length) }
    : { unit: value, customUnit: null };
}

export function productUnitLabel(unit: string | null | undefined, customUnit?: string | null) {
  if (customUnit) return customUnit;
  return BUILTIN_UNITS.find((u) => u.value === unit)?.label ?? unit ?? "";
}

/** Lista jednostek do wyboru; jeśli produkt ma jednostkę usuniętą z listy, nadal ją pokazujemy. */
export function unitChoices(options: ProductOptions | undefined, current?: string | null) {
  const list: { value: string; label: string }[] = BUILTIN_UNITS.map((u) => ({ ...u }));
  const custom = (options?.units ?? []).map((u) => u.name);
  if (current?.startsWith(CUSTOM_PREFIX) && !custom.includes(current.slice(CUSTOM_PREFIX.length))) {
    custom.push(current.slice(CUSTOM_PREFIX.length));
  }
  for (const name of custom) list.push({ value: `${CUSTOM_PREFIX}${name}`, label: name });
  return list;
}

export function categoryChoices(options: ProductOptions | undefined, current?: string | null) {
  const names = (options?.categories ?? []).map((c) => c.name);
  if (current && !names.includes(current)) names.push(current);
  return names;
}
