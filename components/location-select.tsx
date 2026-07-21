"use client";

import useSWR from "swr";

type LocationOption = { id: string; name: string };

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((response) => response.json());

export function useLocationOptions() {
  const { data, isLoading } = useSWR("/api/location-scope", fetcher);
  return {
    locations: (data?.locations ?? []) as LocationOption[],
    selectedLocationId: (data?.selectedLocationId ?? null) as string | null,
    isLoading,
  };
}

export function LocationSelect({
  value,
  onChange,
  disabled = false,
  className = "",
  placeholder = "Wybierz lokalizację",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const { locations, isLoading } = useLocationOptions();

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled || isLoading}
      className={className || "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"}
      required
    >
      <option value="" disabled>
        {isLoading ? "Ładowanie lokalizacji…" : placeholder}
      </option>
      {locations.map((location) => (
        <option key={location.id} value={location.id}>
          {location.name}
        </option>
      ))}
    </select>
  );
}
