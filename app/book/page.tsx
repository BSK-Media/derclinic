"use client";

import * as React from "react";
import Image from "next/image";
import useSWR from "swr";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Sparkles, Check, Calendar as CalendarIcon, Menu, X, ChevronDown, Instagram, Facebook, Phone, Mail, MapPin } from "lucide-react";
import { formatPLNFromGrosze } from "@/lib/money";

async function fetcher(url: string) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data?.message || "Nie udało się pobrać danych");
  return data;
}

type Location = { id: string; name: string };
type Specialist = {
  id: string;
  name: string;
  jobTitle: string | null;
  specialization: string | null;
  avatarUrl: string | null;
  locationId: string;
  serviceIds: string[];
};
type Service = {
  id: string;
  name: string;
  category: string | null;
  categoryColor: string | null;
  description: string | null;
  durationMin: number;
  price: number | null;
};
type MultiSlot = { time: string; specialistId: string; specialistName: string };

const ANY_SPECIALIST = "__ANY__";
const STEP_LABELS = ["Lokalizacja", "Zabieg", "Specjalista", "Termin", "Dane kontaktowe"];

function warsawTodayInput() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function addDaysToInput(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pl-PL", { weekday: "short", day: "numeric", month: "long" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

function formatWeekdayShort(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pl-PL", { weekday: "short" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function dayOfMonth(value: string) {
  return Number(value.split("-")[2]);
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

// Siatka miesiąca (poniedziałek jako pierwszy dzień tygodnia); puste komórki na dni spoza miesiąca.
function buildMonthGrid(year: number, month: number) {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startWeekday = (firstOfMonth.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(`${year}-${pad2(month)}-${pad2(day)}`);
  return cells;
}

function StepProgress({ step }: { step: number }) {
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {STEP_LABELS.map((label, index) => (
        <React.Fragment key={label}>
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={
                "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition " +
                (index < step
                  ? "bg-emerald-600 text-white"
                  : index === step
                    ? "bg-emerald-100 text-emerald-800 ring-2 ring-emerald-500"
                    : "bg-zinc-100 text-zinc-400")
              }
            >
              {index < step ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
            </div>
            <span
              className={
                "hidden whitespace-nowrap text-[11px] font-medium sm:block " +
                (index <= step ? "text-zinc-700" : "text-zinc-400")
              }
            >
              {label}
            </span>
          </div>
          {index < STEP_LABELS.length - 1 ? (
            <div className={"h-px w-6 sm:w-10 " + (index < step ? "bg-emerald-500" : "bg-zinc-200")} />
          ) : null}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function PublicBookingPage() {
  const { data, isLoading, error } = useSWR("/api/public/booking-data", fetcher);
  const locations: Location[] = data?.locations ?? [];
  const specialists: Specialist[] = data?.specialists ?? [];
  const services: Service[] = data?.services ?? [];

  const [step, setStep] = React.useState(0);
  const [locationId, setLocationId] = React.useState("");
  const [serviceId, setServiceId] = React.useState("");
  const [specialistId, setSpecialistId] = React.useState(""); // konkretne id albo ANY_SPECIALIST
  const [serviceQuery, setServiceQuery] = React.useState("");
  const [excludedCategories, setExcludedCategories] = React.useState<Set<string>>(new Set());
  const [date, setDate] = React.useState(() => warsawTodayInput());
  const [weekStart, setWeekStart] = React.useState(() => warsawTodayInput());
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [time, setTime] = React.useState("");
  const [pickedSpecialist, setPickedSpecialist] = React.useState<{ id: string; name: string } | null>(null);

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [note, setNote] = React.useState("");
  const [accountMode, setAccountMode] = React.useState<"guest" | "register">("guest");
  const [password, setPassword] = React.useState("");
  const [passwordConfirm, setPasswordConfirm] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState("");
  const [confirmedAt, setConfirmedAt] = React.useState<string | null>(null);
  const [accountCreated, setAccountCreated] = React.useState(false);

  // Jedna lokalizacja — pomijamy krok wyboru.
  React.useEffect(() => {
    if (locations.length === 1 && !locationId) setLocationId(locations[0].id);
  }, [locations, locationId]);

  const calendarRef = React.useRef<HTMLDivElement | null>(null);
  const [calendarMonth, setCalendarMonth] = React.useState(() => {
    const [y, m] = date.split("-").map(Number);
    return { year: y, month: m };
  });

  React.useEffect(() => {
    if (!calendarOpen) return;
    const [y, m] = date.split("-").map(Number);
    setCalendarMonth({ year: y, month: m });
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) setCalendarOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [calendarOpen, date]);

  const allCategories = React.useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const service of services) {
      const category = service.category || "Pozostałe zabiegi";
      if (!seen.has(category)) {
        seen.add(category);
        ordered.push(category);
      }
    }
    return ordered;
  }, [services]);

  function toggleCategory(category: string) {
    setExcludedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function toggleAllCategories() {
    setExcludedCategories((current) => (current.size === 0 ? new Set(allCategories) : new Set()));
  }

  const filteredServices = React.useMemo(() => {
    const q = serviceQuery.trim().toLowerCase();
    return services.filter((service) => {
      const category = service.category || "Pozostałe zabiegi";
      // Aktywne wyszukiwanie działa niezależnie od zaznaczonych kategorii —
      // filtr kategorii ma pomagać w przeglądaniu, a nie ograniczać wyniki
      // wyszukiwania frazy. Kategorie liczą się tylko wtedy, gdy pole
      // wyszukiwania jest puste.
      if (!q) {
        return !excludedCategories.has(category);
      }
      return service.name.toLowerCase().includes(q) || category.toLowerCase().includes(q);
    });
  }, [services, serviceQuery, excludedCategories]);

  const servicesByCategory = React.useMemo(() => {
    const groups = new Map<string, Service[]>();
    for (const service of filteredServices) {
      const key = service.category || "Pozostałe zabiegi";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(service);
    }
    return [...groups.entries()];
  }, [filteredServices]);

  const selectedService = services.find((s) => s.id === serviceId) ?? null;

  // Specjaliści wykonujący wybrany zabieg w wybranej lokalizacji.
  const qualifyingSpecialists = React.useMemo(() => {
    if (!serviceId) return [];
    return specialists.filter((s) => (!locationId || s.locationId === locationId) && s.serviceIds.includes(serviceId));
  }, [specialists, serviceId, locationId]);

  const selectedSpecialist =
    specialistId && specialistId !== ANY_SPECIALIST ? specialists.find((s) => s.id === specialistId) ?? null : null;
  const isAnySpecialist = specialistId === ANY_SPECIALIST;

  const displaySpecialistName = isAnySpecialist
    ? pickedSpecialist?.name ?? null
    : selectedSpecialist?.name ?? null;

  const weekDays = React.useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysToInput(weekStart, i)),
    [weekStart],
  );

  // Dostępność dla konkretnego, wybranego specjalisty.
  const { data: singleAvailability, isLoading: loadingSingleSlots } = useSWR(
    !isAnySpecialist && specialistId && serviceId && date
      ? `/api/public/availability?specialistId=${specialistId}&serviceId=${serviceId}&date=${date}`
      : null,
    fetcher,
  );
  // Zbiorcza dostępność, gdy klient nie wybiera konkretnego specjalisty.
  const { data: multiAvailability, isLoading: loadingMultiSlots } = useSWR(
    isAnySpecialist && serviceId && date
      ? `/api/public/availability-multi?serviceId=${serviceId}&locationId=${locationId}&date=${date}`
      : null,
    fetcher,
  );
  // Zbiorcze "czy dzień ma jakikolwiek wolny termin" dla całego widocznego tygodnia —
  // pozwala wyszarzyć puste dni na pasku bez odpytywania osobno za każdy dzień.
  const { data: weekAvailability } = useSWR(
    serviceId && (specialistId === ANY_SPECIALIST ? locationId : specialistId)
      ? `/api/public/availability-days?serviceId=${serviceId}&dates=${weekDays.join(",")}` +
        (isAnySpecialist ? `&locationId=${locationId}` : `&specialistId=${specialistId}`)
      : null,
    fetcher,
  );
  const dayHasSlots: Record<string, boolean> = weekAvailability?.days ?? {};

  const singleSlots: string[] = singleAvailability?.slots ?? [];
  const multiSlots: MultiSlot[] = multiAvailability?.slots ?? [];
  const loadingSlots = isAnySpecialist ? loadingMultiSlots : loadingSingleSlots;

  function goToStep(target: number) {
    setStep(target);
  }

  function selectLocation(id: string) {
    setLocationId(id);
    setServiceId("");
    setSpecialistId("");
    setPickedSpecialist(null);
    setTime("");
    goToStep(1);
  }

  function selectService(id: string) {
    setServiceId(id);
    setSpecialistId("");
    setPickedSpecialist(null);
    setTime("");

    const qualifying = specialists.filter(
      (s) => (!locationId || s.locationId === locationId) && s.serviceIds.includes(id),
    );
    if (qualifying.length === 1) {
      // Tylko jeden specjalista wykonuje ten zabieg — nie ma czego wybierać.
      setSpecialistId(qualifying[0].id);
      goToStep(3);
    } else {
      goToStep(2);
    }
  }

  function selectSpecialist(id: string) {
    setSpecialistId(id);
    setPickedSpecialist(null);
    setTime("");
    goToStep(3);
  }

  function selectAnySpecialist() {
    setSpecialistId(ANY_SPECIALIST);
    setPickedSpecialist(null);
    setTime("");
    goToStep(3);
  }

  function selectSingleTime(slot: string) {
    setTime(slot);
    goToStep(4);
  }

  function selectMultiTime(slot: MultiSlot) {
    setTime(slot.time);
    setPickedSpecialist({ id: slot.specialistId, name: slot.specialistName });
    goToStep(4);
  }

  const today = warsawTodayInput();
  const maxDate = addDaysToInput(today, 60);

  const canGoPrevWeek = weekStart > today;
  const canGoNextWeek = addDaysToInput(weekStart, 7) <= maxDate;

  function goPrevWeek() {
    setWeekStart((current) => {
      const candidate = addDaysToInput(current, -7);
      return candidate < today ? today : candidate;
    });
  }

  function goNextWeek() {
    if (!canGoNextWeek) return;
    setWeekStart((current) => addDaysToInput(current, 7));
  }

  function pickDate(value: string) {
    setDate(value);
    const idealStart = addDaysToInput(value, -3);
    setWeekStart(idealStart < today ? today : idealStart);
    setTime("");
  }

  function pickDateFromCalendar(value: string) {
    pickDate(value);
    setCalendarOpen(false);
  }

  async function submitBooking() {
    setSubmitError("");
    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !email.trim()) {
      setSubmitError("Podaj imię, nazwisko, numer telefonu i adres e-mail");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setSubmitError("Niepoprawny adres e-mail");
      return;
    }
    if (accountMode === "register") {
      if (password.length < 6) {
        setSubmitError("Hasło musi mieć co najmniej 6 znaków");
        return;
      }
      if (password !== passwordConfirm) {
        setSubmitError("Podane hasła różnią się od siebie");
        return;
      }
    }
    const finalSpecialistId = isAnySpecialist ? pickedSpecialist?.id : specialistId;
    if (!finalSpecialistId) {
      setSubmitError("Wybierz termin ponownie");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/public/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locationId,
          specialistId: finalSpecialistId,
          serviceId,
          date,
          time,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          note: note.trim() || undefined,
          password: accountMode === "register" ? password : undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        setSubmitError(result?.message || "Nie udało się zapisać wizyty. Spróbuj ponownie.");
        return;
      }
      setAccountCreated(Boolean(result.accountCreated));
      setConfirmedAt(result.startsAt);
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmedAt) {
    return (
      <BookingShell>
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900">Wizyta zarezerwowana!</h1>
          <p className="max-w-md text-sm text-zinc-500">
            {displaySpecialistName} — {selectedService?.name}
            <br />
            {new Date(confirmedAt).toLocaleString("pl-PL", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="max-w-md text-xs text-zinc-400">
            Potwierdzenie zostało zapisane w systemie kliniki. Skontaktujemy się, jeśli będą potrzebne
            dodatkowe informacje.
          </p>
          {accountCreated ? (
            <p className="max-w-md rounded-xl bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
              Konto zostało założone na numer telefonu {phone.trim()}. Panel klienta z historią wizyt
              pojawi się wkrótce — o uruchomieniu poinformujemy Cię osobno.
            </p>
          ) : null}
        </div>
      </BookingShell>
    );
  }

  if (error) {
    return (
      <BookingShell>
        <div className="py-10 text-center text-sm text-red-600">
          Nie udało się załadować formularza rezerwacji. Spróbuj odświeżyć stronę.
        </div>
      </BookingShell>
    );
  }

  const summaryItems = [
    {
      label: "Lokalizacja",
      value: locations.find((l) => l.id === locationId)?.name ?? null,
      onClick: locationId && locations.length > 1 ? () => goToStep(0) : undefined,
    },
    {
      label: "Zabieg",
      value: selectedService?.name ?? null,
      onClick: serviceId ? () => goToStep(1) : undefined,
    },
    {
      label: "Specjalista",
      value: isAnySpecialist ? (pickedSpecialist?.name ?? "Dowolny specjalista") : (selectedSpecialist?.name ?? null),
      onClick: specialistId ? () => goToStep(qualifyingSpecialists.length <= 1 ? 1 : 2) : undefined,
    },
    {
      label: "Termin",
      value: time ? `${formatDateLabel(date)}, ${time}` : null,
      onClick: time ? () => goToStep(3) : undefined,
    },
  ];

  return (
    <BookingShell wide bare>
      <div className={"grid gap-6 md:grid-cols-[240px_1fr] " + (step === 1 ? "xl:grid-cols-[240px_1fr_440px]" : "")}>
        <SummarySidebar items={summaryItems} />
        <div className="min-w-0">
          <MobileSummaryBar items={summaryItems} />
          <div className="min-w-0 rounded-2xl border bg-white p-5 shadow-sm sm:p-8">
      <StepProgress step={step} />

      {isLoading ? (
        <div className="flex justify-center py-16 text-zinc-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : null}

      {!isLoading && step === 0 ? (
        <StepCard title="Wybierz lokalizację">
          <div className="grid gap-3 sm:grid-cols-2">
            {locations.map((loc) => (
              <OptionCard key={loc.id} selected={locationId === loc.id} onClick={() => selectLocation(loc.id)}>
                <div className="font-medium text-zinc-900">{loc.name}</div>
              </OptionCard>
            ))}
          </div>
        </StepCard>
      ) : null}

      {!isLoading && step === 1 ? (
        <StepCard title="Wybierz zabieg" onBack={locations.length > 1 ? () => goToStep(0) : undefined}>
          <input
            value={serviceQuery}
            onChange={(e) => setServiceQuery(e.target.value)}
            placeholder="Szukaj zabiegu…"
            className="input mb-4"
          />
          <div className="max-h-[26rem] space-y-5 overflow-y-auto pr-1">
            {servicesByCategory.length === 0 ? (
              <div className="text-sm text-zinc-500">Brak zabiegów pasujących do wyszukiwania.</div>
            ) : null}
            {servicesByCategory.map(([category, items]) => (
              <div key={category}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {category}
                </div>
                <div className="grid gap-3">
                  {items.map((service) => (
                    <OptionCard
                      key={service.id}
                      selected={serviceId === service.id}
                      onClick={() => selectService(service.id)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-zinc-900">{service.name}</div>
                          <div className="text-xs text-zinc-500">{service.durationMin} min</div>
                        </div>
                        <div className="shrink-0 font-semibold text-emerald-700">
                          {formatPLNFromGrosze(service.price)}
                        </div>
                      </div>
                    </OptionCard>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </StepCard>
      ) : null}

      {!isLoading && step === 2 ? (
        <StepCard title="Wybierz specjalistę" onBack={() => goToStep(1)}>
          <button
            type="button"
            onClick={selectAnySpecialist}
            className="mb-4 flex w-full items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-left text-sm transition hover:bg-emerald-100"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
              <Sparkles className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-medium text-emerald-900">Dowolny specjalista</span>
              <span className="block text-xs text-emerald-700">Pokażemy najbliższy wolny termin</span>
            </span>
          </button>

          <div className="grid gap-3 sm:grid-cols-2">
            {qualifyingSpecialists.length === 0 ? (
              <div className="text-sm text-zinc-500 sm:col-span-2">
                Brak specjalistów wykonujących ten zabieg w wybranej lokalizacji.
              </div>
            ) : null}
            {qualifyingSpecialists.map((s) => (
              <OptionCard key={s.id} selected={specialistId === s.id} onClick={() => selectSpecialist(s.id)}>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-100 text-sm font-semibold text-zinc-500">
                    {s.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.avatarUrl} alt={s.name} className="h-full w-full object-cover" />
                    ) : (
                      s.name.slice(0, 1)
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-zinc-900">{s.name}</div>
                    {s.jobTitle ? <div className="text-xs text-zinc-500">{s.jobTitle}</div> : null}
                  </div>
                </div>
              </OptionCard>
            ))}
          </div>
        </StepCard>
      ) : null}

      {!isLoading && step === 3 ? (
        <StepCard
          title="Wybierz termin"
          onBack={() => goToStep(qualifyingSpecialists.length <= 1 ? 1 : 2)}
        >
          <div className="relative mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={goPrevWeek}
              disabled={!canGoPrevWeek}
              aria-label="Poprzedni tydzień"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="grid min-w-0 flex-1 grid-cols-7 gap-1.5 sm:gap-2">
              {weekDays.map((value) => {
                const active = value === date;
                const beyondRange = value > maxDate;
                const noSlots = !beyondRange && dayHasSlots[value] === false;
                const disabled = beyondRange || noSlots;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => pickDate(value)}
                    disabled={disabled}
                    className={
                      "flex flex-col items-center rounded-xl border py-2 text-xs font-medium capitalize transition disabled:cursor-not-allowed " +
                      (active
                        ? "border-emerald-500 bg-emerald-600 text-white"
                        : noSlots
                          ? "border-zinc-200 bg-[repeating-linear-gradient(135deg,#f4f4f5,#f4f4f5_5px,#e4e4e7_5px,#e4e4e7_6px)] text-zinc-400"
                          : beyondRange
                            ? "border-zinc-200 text-zinc-600 opacity-30"
                            : "border-zinc-200 text-zinc-600 hover:bg-zinc-50")
                    }
                  >
                    <span className={active ? "text-emerald-50" : "text-zinc-400"}>{formatWeekdayShort(value)}</span>
                    <span className="text-base font-semibold">{dayOfMonth(value)}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={goNextWeek}
              disabled={!canGoNextWeek}
              aria-label="Następny tydzień"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <div className="relative shrink-0" ref={calendarRef}>
              <button
                type="button"
                onClick={() => setCalendarOpen((open) => !open)}
                aria-label="Otwórz pełny kalendarz"
                className={
                  "flex h-9 w-9 items-center justify-center rounded-xl border transition " +
                  (calendarOpen
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-zinc-200 text-zinc-500 hover:bg-zinc-50")
                }
              >
                <CalendarIcon className="h-4 w-4" />
              </button>

              {calendarOpen ? (
                <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-zinc-200 bg-white p-3 shadow-lg">
                  <div className="mb-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarMonth((m) => (m.month === 1 ? { year: m.year - 1, month: 12 } : { year: m.year, month: m.month - 1 }))
                      }
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100"
                      aria-label="Poprzedni miesiąc"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="text-sm font-medium capitalize text-zinc-900">
                      {monthLabel(calendarMonth.year, calendarMonth.month)}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarMonth((m) => (m.month === 12 ? { year: m.year + 1, month: 1 } : { year: m.year, month: m.month + 1 }))
                      }
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100"
                      aria-label="Następny miesiąc"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase text-zinc-400">
                    {["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Niedz"].map((d) => (
                      <div key={d}>{d}</div>
                    ))}
                  </div>
                  <div className="mt-1 grid grid-cols-7 gap-1">
                    {buildMonthGrid(calendarMonth.year, calendarMonth.month).map((cellValue, index) => {
                      if (!cellValue) return <div key={`empty-${index}`} />;
                      const disabled = cellValue < today || cellValue > maxDate;
                      const active = cellValue === date;
                      return (
                        <button
                          key={cellValue}
                          type="button"
                          disabled={disabled}
                          onClick={() => pickDateFromCalendar(cellValue)}
                          className={
                            "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition disabled:cursor-not-allowed disabled:text-zinc-300 " +
                            (active
                              ? "bg-emerald-600 text-white"
                              : disabled
                                ? ""
                                : "text-zinc-700 hover:bg-emerald-50")
                          }
                        >
                          {dayOfMonth(cellValue)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {loadingSlots ? (
            <div className="flex justify-center py-8 text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : isAnySpecialist ? (
            multiSlots.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-zinc-500">
                Brak wolnych terminów tego dnia u żadnego specjalisty. Wybierz inny dzień.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {multiSlots.map((slot) => (
                  <button
                    key={slot.time + slot.specialistId}
                    type="button"
                    onClick={() => selectMultiTime(slot)}
                    className={
                      "rounded-xl border px-3 py-2 text-left text-sm font-medium transition " +
                      (time === slot.time
                        ? "border-emerald-500 bg-emerald-600 text-white"
                        : "border-zinc-200 text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50")
                    }
                  >
                    <div>{slot.time}</div>
                    <div
                      className={
                        "text-[11px] font-normal " + (time === slot.time ? "text-emerald-50" : "text-zinc-400")
                      }
                    >
                      {slot.specialistName}
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : singleSlots.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-zinc-500">
              Brak wolnych terminów tego dnia. Wybierz inny dzień.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {singleSlots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => selectSingleTime(slot)}
                  className={
                    "rounded-xl border px-2 py-2.5 text-sm font-medium transition " +
                    (time === slot
                      ? "border-emerald-500 bg-emerald-600 text-white"
                      : "border-zinc-200 text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50")
                  }
                >
                  {slot}
                </button>
              ))}
            </div>
          )}
        </StepCard>
      ) : null}

      {!isLoading && step === 4 ? (
        <StepCard title="Dane kontaktowe" onBack={() => goToStep(3)}>
          <div className="mb-4 rounded-xl bg-zinc-50 p-3 text-sm">
            <div className="font-medium text-zinc-900">{selectedService?.name}</div>
            <div className="text-zinc-500">
              {displaySpecialistName} • {formatDateLabel(date)}, {time}
            </div>
            <div className="mt-1 font-semibold text-emerald-700">
              {formatPLNFromGrosze(selectedService?.price ?? null)}
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAccountMode("guest")}
              className={
                "rounded-xl border px-3 py-2.5 text-left text-sm transition " +
                (accountMode === "guest"
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-zinc-200 hover:bg-zinc-50")
              }
            >
              <div className="font-medium text-zinc-900">Kontynuuj jako gość</div>
              <div className="text-xs text-zinc-500">Bez zakładania konta</div>
            </button>
            <button
              type="button"
              onClick={() => setAccountMode("register")}
              className={
                "rounded-xl border px-3 py-2.5 text-left text-sm transition " +
                (accountMode === "register"
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-zinc-200 hover:bg-zinc-50")
              }
            >
              <div className="font-medium text-zinc-900">Zarejestruj się</div>
              <div className="text-xs text-zinc-500">Załóż konto z hasłem</div>
            </button>
          </div>

          {accountMode === "register" ? (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-900">
                <Sparkles className="h-4 w-4" /> Korzyści konta w DerClinic
              </div>
              <ul className="space-y-1.5 text-xs text-emerald-800">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Punkty za każdą wizytę i zakup — wymienisz je na kolejne zabiegi</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Szybsza rezerwacja i pełna historia wizyt bez podawania danych za każdym razem</span>
                </li>
              </ul>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Imię *">
              <input
                className="input"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </Field>
            <Field label="Nazwisko *">
              <input
                className="input"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </Field>
            <Field label="Telefon *">
              <input
                className="input"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="np. 600 000 000"
              />
            </Field>
            <Field label="E-mail *">
              <input
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            {accountMode === "register" ? (
              <>
                <Field label="Hasło *">
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="min. 6 znaków"
                  />
                </Field>
                <Field label="Powtórz hasło *">
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                  />
                </Field>
              </>
            ) : null}
            <div className="sm:col-span-2">
              <Field label="Uwagi dla specjalisty (opcjonalnie)">
                <textarea
                  className="input min-h-20 resize-y"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
            </div>
          </div>

          {submitError ? <div className="mt-3 text-sm text-red-600">{submitError}</div> : null}

          <button
            type="button"
            onClick={submitBooking}
            disabled={submitting}
            className="mt-5 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting ? "Zapisywanie…" : "Potwierdź rezerwację"}
          </button>
        </StepCard>
      ) : null}

      <style jsx global>{`
        /*
         * Widget rezerwacji jest publiczną stroną i ma zawsze wyglądać
         * tak samo, niezależnie od ciemnego motywu systemu/przeglądarki
         * odwiedzającego. Bez poniższej deklaracji część przeglądarek
         * (np. wymuszony "ciemny motyw stron" w Chrome) sama przemalowuje
         * niestylowane elementy (pola formularzy, domyślny kolor tekstu)
         * na biały tekst na białym tle, co robi stronę nieczytelną.
         */
        html,
        body {
          color-scheme: light only;
        }
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid #e4e4e7;
          padding: 0.6rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
          background-color: #ffffff;
          color: #18181b;
        }
        .input::placeholder {
          color: #a1a1aa;
        }
        .input:focus {
          border-color: #10b981;
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.15);
        }
      `}</style>
          </div>
        </div>

        {step === 1 ? (
          <CategoryFilterSidebar
            categories={allCategories}
            excluded={excludedCategories}
            onToggleAll={toggleAllCategories}
            onToggleCategory={toggleCategory}
          />
        ) : null}
      </div>
    </BookingShell>
  );
}

// Struktura menu i danych kontaktowych odzwierciedla stronę główną
// https://derclinic.pl/ — trzymana jest tu jako stałe dane, bo widget
// rezerwacji to osobna aplikacja (Next.js) bez dostępu do treści WordPressa.
const SITE_URL = "https://derclinic.pl";
const SITE_NAV: { label: string; href: string; children?: { label: string; href: string }[] }[] = [
  {
    label: "O klinice",
    href: `${SITE_URL}/o-klinice/`,
    children: [
      { label: "O nas", href: `${SITE_URL}/o-nas/` },
      { label: "Galeria", href: `${SITE_URL}/o-klinice/galeria/` },
      { label: "Zespół", href: `${SITE_URL}/o-klinice/zespol/` },
      { label: "Opinie", href: `${SITE_URL}/o-klinice/opinie/` },
      { label: "Media o nas", href: `${SITE_URL}/media-o-nas/` },
      { label: "Blog", href: `${SITE_URL}/category/blog/` },
      { label: "Praca", href: `${SITE_URL}/o-klinice/praca/` },
    ],
  },
  {
    label: "Usługi",
    href: `${SITE_URL}/uslugi/`,
    children: [
      { label: "Medycyna estetyczna", href: `${SITE_URL}/medycyna-estetyczna/` },
      { label: "Dermatologia", href: `${SITE_URL}/dermatologia/` },
      { label: "Kosmetologia estetyczna", href: `${SITE_URL}/kosmetologia-estetyczna/` },
      { label: "Ginekologia", href: `${SITE_URL}/ginekologia/` },
      { label: "Chirurgia plastyczna", href: `${SITE_URL}/chirurgia-plastyczna/` },
      { label: "Chirurgia naczyniowa", href: `${SITE_URL}/chirurgia-naczyniowa/` },
      { label: "Badania USG", href: `${SITE_URL}/badania-usg/` },
      { label: "Centrum leczenia ran", href: `${SITE_URL}/centrum-leczenia-ran/` },
      { label: "Leczenie otyłości", href: `${SITE_URL}/leczenie-otylosci/` },
      { label: "DerClinic Metabolic", href: `${SITE_URL}/derclinic-metabolic/` },
    ],
  },
  { label: "Cennik", href: `${SITE_URL}/cennik/` },
  { label: "Twój problem", href: `${SITE_URL}/tp/` },
  { label: "Szkolenia", href: `${SITE_URL}/szkolenia/` },
  { label: "Academic Review", href: `${SITE_URL}/academic-review/` },
  { label: "Kariera", href: `${SITE_URL}/kariera/` },
  { label: "Kontakt", href: `${SITE_URL}/kontakt/` },
];

const POPULAR_TREATMENTS: { label: string; href: string }[] = [
  { label: "Powiększanie i modelowanie ust", href: `${SITE_URL}/medycyna-estetyczna/kwas-hialuronowy/powiekszanie-i-modelowanie-ust/` },
  { label: "Wypełnianie zmarszczek", href: `${SITE_URL}/medycyna-estetyczna/kwas-hialuronowy/wypelnianie-zmarszczek/` },
  { label: "Mezobotoks", href: `${SITE_URL}/medycyna-estetyczna/toksyna-botulinowa/mezobotoks/` },
  { label: "Osocze bogatopłytkowe PRP", href: `${SITE_URL}/medycyna-estetyczna/osocze-bogatoplytkowe/osocze-prp/` },
  { label: "Mezoterapia igłowa", href: `${SITE_URL}/medycyna-estetyczna/mezoterapia/mezoterapia-iglowa-autorskimi-koktajlami/` },
  { label: "Lipoliza iniekcyjna", href: `${SITE_URL}/medycyna-estetyczna/mezoterapia/mezoterapia-iniekcyjna-lipoliza-intralipoterapia/` },
  { label: "Hialuronidaza iniekcyjna", href: `${SITE_URL}/medycyna-estetyczna/hialuronidaza/hialuronidaza-iniekcyjna/` },
  { label: "Usuwanie zmian skórnych", href: `${SITE_URL}/dermatologia/usuwanie-zmian-skornych/` },
  { label: "Usuwanie włókniaków, tłuszczaków i kaszaków", href: `${SITE_URL}/dermatologia/usuwanie-wlokniakow-tluszczakow-i-kaszakow/` },
  { label: "ICOONE laserowe modelowanie sylwetki", href: `${SITE_URL}/kosmetologia-estetyczna/icoonelaser-modelowanie-sylwetki/` },
  { label: "Oczyszczanie twarzy – mikrodermabrazja wodna", href: `${SITE_URL}/kosmetologia-estetyczna/hydrafacial/` },
  { label: "Mezoterapia stymulująca – mikroigłowa", href: `${SITE_URL}/kosmetologia-estetyczna/dermapen-4-0-mezoterapia-mikroiglowa/` },
  { label: "Leczenie nadpotliwości pach/dłoni/stóp", href: `${SITE_URL}/medycyna-estetyczna/toksyna-botulinowa/leczenie-nadpotliwosci-pach-dloni-stop/` },
  { label: "Leczenie bruksizmu botoksem", href: `${SITE_URL}/medycyna-estetyczna/toksyna-botulinowa/leczenie-bruksizmu/` },
  { label: "Blefaroplastyka – plastyka powiek", href: `${SITE_URL}/medycyna-estetyczna/blefaroplastyka-powiek-gornych/` },
  { label: "Korekta uśmiechu dziąsłowego", href: `${SITE_URL}/medycyna-estetyczna/toksyna-botulinowa/terapia-usmiechu-dziaslowego/` },
  { label: "Kwas hialuronowy", href: `${SITE_URL}/medycyna-estetyczna/kwas-hialuronowy/` },
  { label: "Toksyna botulinowa / botoks", href: `${SITE_URL}/medycyna-estetyczna/toksyna-botulinowa/` },
];

const PARTNER_BRANDS = ["Hydrafacial", "iCoone Laser", "Jalupro", "PRO XN", "MEDIDERMA", "MedEstelle"];

const CONTACT = {
  email: "kontakt@derclinic.pl",
  phone: "+48 570 070 750",
  phoneHref: "tel:+48570070750",
  address: "ul. Jana Kilińskiego 11, lok. 47, Grodzisk Mazowiecki koło Warszawy",
  mapHref: "https://goo.gl/maps/KhFEWv2xRsGtLVQm8",
  booksyHref: "https://booksy.com/pl-pl/124865_derclinic_medycyna-estetyczna_4424_grodzisk-mazowiecki",
  instagramHref: "https://www.instagram.com/der_clinic/",
  facebookHref: "https://www.facebook.com/people/DerClinic/100077195193118/",
};

function SiteHeader() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [openMobileSection, setOpenMobileSection] = React.useState<string | null>(null);

  return (
    <header className="sticky top-0 z-40 border-b bg-white">
      {/* Górny pasek: kontakt i social media — ukryty na małych ekranach */}
      <div className="hidden border-b border-zinc-100 bg-zinc-50 sm:block">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-5 px-4 py-1.5 text-xs text-zinc-500">
          <a href={CONTACT.phoneHref} className="flex items-center gap-1.5 hover:text-emerald-700">
            <Phone className="h-3.5 w-3.5" /> {CONTACT.phone}
          </a>
          <a href={CONTACT.mapHref} target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 hover:text-emerald-700 md:flex">
            <MapPin className="h-3.5 w-3.5" /> Grodzisk Mazowiecki
          </a>
          <a href={CONTACT.booksyHref} target="_blank" rel="noreferrer" className="hover:text-emerald-700">
            Booksy
          </a>
          <a href={CONTACT.instagramHref} target="_blank" rel="noreferrer" aria-label="Instagram" className="hover:text-emerald-700">
            <Instagram className="h-3.5 w-3.5" />
          </a>
          <a href={CONTACT.facebookHref} target="_blank" rel="noreferrer" aria-label="Facebook" className="hover:text-emerald-700">
            <Facebook className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Główny wiersz: logo + nawigacja + CTA */}
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <a href={SITE_URL} className="shrink-0">
          <Image src="/derclinic-logo.webp" alt="DerClinic" width={150} height={38} priority />
        </a>

        <nav className="hidden items-center gap-1 lg:flex">
          {SITE_NAV.map((item) =>
            item.children ? (
              <div key={item.label} className="group relative">
                <a
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:text-emerald-700"
                >
                  {item.label}
                  <ChevronDown className="h-3.5 w-3.5" />
                </a>
                <div className="invisible absolute left-0 top-full z-50 min-w-[240px] rounded-xl border border-zinc-100 bg-white p-2 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100">
                  {item.children.map((sub) => (
                    <a
                      key={sub.label}
                      href={sub.href}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-emerald-50 hover:text-emerald-800"
                    >
                      {sub.label}
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:text-emerald-700"
              >
                {item.label}
              </a>
            ),
          )}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={SITE_URL}
            className="hidden rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 sm:block"
          >
            Umów wizytę
          </a>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 text-zinc-600 lg:hidden"
            aria-label={mobileOpen ? "Zamknij menu" : "Otwórz menu"}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Menu mobilne */}
      {mobileOpen ? (
        <div className="border-t bg-white px-4 py-3 lg:hidden">
          <nav className="flex flex-col">
            {SITE_NAV.map((item) =>
              item.children ? (
                <div key={item.label} className="border-b border-zinc-100 py-1">
                  <button
                    type="button"
                    onClick={() => setOpenMobileSection((current) => (current === item.label ? null : item.label))}
                    className="flex w-full items-center justify-between py-2 text-sm font-medium text-zinc-800"
                  >
                    {item.label}
                    <ChevronDown className={"h-4 w-4 transition " + (openMobileSection === item.label ? "rotate-180" : "")} />
                  </button>
                  {openMobileSection === item.label ? (
                    <div className="pb-2 pl-3">
                      {item.children.map((sub) => (
                        <a key={sub.label} href={sub.href} target="_blank" rel="noreferrer" className="block py-1.5 text-sm text-zinc-600">
                          {sub.label}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="border-b border-zinc-100 py-2.5 text-sm font-medium text-zinc-800"
                >
                  {item.label}
                </a>
              ),
            )}
            <a href={CONTACT.phoneHref} className="flex items-center gap-2 py-3 text-sm text-zinc-600">
              <Phone className="h-4 w-4" /> {CONTACT.phone}
            </a>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-10 border-t bg-zinc-900 text-zinc-300">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Image src="/derclinic-logo.webp" alt="DerClinic" width={140} height={35} className="mb-4 brightness-0 invert" />
            <div className="space-y-2 text-sm">
              <a href={`mailto:${CONTACT.email}`} className="flex items-center gap-2 hover:text-emerald-400">
                <Mail className="h-4 w-4 shrink-0" /> {CONTACT.email}
              </a>
              <a href={CONTACT.phoneHref} className="flex items-center gap-2 hover:text-emerald-400">
                <Phone className="h-4 w-4 shrink-0" /> {CONTACT.phone}
              </a>
              <a href={CONTACT.mapHref} target="_blank" rel="noreferrer" className="flex items-start gap-2 hover:text-emerald-400">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> <span>{CONTACT.address}</span>
              </a>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <a href={CONTACT.booksyHref} target="_blank" rel="noreferrer" className="rounded-full border border-zinc-700 px-3 py-1 text-xs hover:border-emerald-500 hover:text-emerald-400">
                Booksy
              </a>
              <a href={CONTACT.instagramHref} target="_blank" rel="noreferrer" aria-label="Instagram" className="text-zinc-400 hover:text-emerald-400">
                <Instagram className="h-4 w-4" />
              </a>
              <a href={CONTACT.facebookHref} target="_blank" rel="noreferrer" aria-label="Facebook" className="text-zinc-400 hover:text-emerald-400">
                <Facebook className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Menu</div>
            <ul className="space-y-2 text-sm">
              {SITE_NAV.map((item) => (
                <li key={item.label}>
                  <a href={item.href} target="_blank" rel="noreferrer" className="hover:text-emerald-400">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Popularne zabiegi</div>
            <ul className="space-y-2 text-sm">
              {POPULAR_TREATMENTS.map((item) => (
                <li key={item.label}>
                  <a href={item.href} target="_blank" rel="noreferrer" className="hover:text-emerald-400">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Partnerzy</div>
            <div className="flex flex-wrap gap-2">
              {PARTNER_BRANDS.map((brand) => (
                <span key={brand} className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">
                  {brand}
                </span>
              ))}
            </div>

            <div className="mt-6 mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Dokumenty</div>
            <ul className="space-y-2 text-sm">
              <li>
                <a href={`${SITE_URL}/regulamin/`} target="_blank" rel="noreferrer" className="hover:text-emerald-400">
                  Regulamin
                </a>
              </li>
              <li>
                <a href={`${SITE_URL}/polityka-prywatnosci/`} target="_blank" rel="noreferrer" className="hover:text-emerald-400">
                  Polityka prywatności
                </a>
              </li>
              <li>
                <a href={`${SITE_URL}/mapa-strony/`} target="_blank" rel="noreferrer" className="hover:text-emerald-400">
                  Mapa strony
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-zinc-800 pt-6 text-center text-xs text-zinc-500">
          © {new Date().getFullYear()} DerClinic Klinika Medycyny Estetycznej. Wszelkie prawa zastrzeżone.
        </div>
      </div>
    </footer>
  );
}

function BookingShell({
  children,
  wide = false,
  bare = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
  bare?: boolean;
}) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <SiteHeader />
      <main className={"mx-auto px-4 py-8 " + (wide ? "max-w-7xl" : "max-w-4xl")}>
        {bare ? children : <div className="rounded-2xl border bg-white p-5 shadow-sm sm:p-8">{children}</div>}
      </main>
      <SiteFooter />
    </div>
  );
}

function StepCard({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100"
            aria-label="Wstecz"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : null}
        <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

type SummaryItem = { label: string; value: string | null; onClick?: () => void };

function SummarySidebar({ items }: { items: SummaryItem[] }) {
  return (
    <div className="hidden self-start rounded-2xl border bg-white p-4 shadow-sm md:sticky md:top-8 md:block">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Twój wybór</div>
      <div className="space-y-3">
        {items.map((item) => (
          <SummaryRow key={item.label} {...item} />
        ))}
      </div>
    </div>
  );
}

function CategoryFilterSidebar({
  categories,
  excluded,
  onToggleAll,
  onToggleCategory,
}: {
  categories: string[];
  excluded: Set<string>;
  onToggleAll: () => void;
  onToggleCategory: (category: string) => void;
}) {
  return (
    <div className="self-start rounded-2xl border bg-white p-4 shadow-sm md:col-span-2 xl:col-span-1 xl:sticky xl:top-8">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Kategorie</div>
      <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-sm hover:bg-zinc-50">
        <input
          type="checkbox"
          checked={excluded.size === 0}
          onChange={onToggleAll}
          className="h-4 w-4 shrink-0 accent-emerald-600"
        />
        <span className="font-medium text-zinc-900">Wszystkie</span>
      </label>
      <div className="my-2 border-t border-zinc-100" />
      <div className="max-h-[28rem] space-y-0.5 overflow-y-auto pr-1">
        {categories.map((category) => (
          <label
            key={category}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-sm hover:bg-zinc-50"
          >
            <input
              type="checkbox"
              checked={!excluded.has(category)}
              onChange={() => onToggleCategory(category)}
              className="h-4 w-4 shrink-0 accent-emerald-600"
            />
            <span className="truncate text-zinc-700">{category}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, onClick }: SummaryItem) {
  const filled = Boolean(value);
  const content = (
    <div className="flex items-start gap-2.5">
      <span
        className={
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full " +
          (filled ? "bg-emerald-500 text-white" : "border border-zinc-300")
        }
      >
        {filled ? <Check className="h-2.5 w-2.5" /> : null}
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{label}</div>
        <div className={"break-words text-sm " + (filled ? "font-medium text-zinc-900" : "text-zinc-400")}>
          {value ?? "—"}
        </div>
      </div>
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="-m-1.5 block w-full rounded-lg p-1.5 text-left transition hover:bg-zinc-50"
      >
        {content}
      </button>
    );
  }
  return <div className="-m-1.5 p-1.5">{content}</div>;
}

function MobileSummaryBar({ items }: { items: SummaryItem[] }) {
  const filledItems = items.filter((item) => item.value);
  if (filledItems.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap gap-2 md:hidden">
      {filledItems.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={item.onClick}
          disabled={!item.onClick}
          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-left text-xs font-medium text-zinc-600 disabled:opacity-70"
        >
          <span className="text-zinc-400">{item.label}: </span>
          {item.value}
        </button>
      ))}
    </div>
  );
}

function OptionCard({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-xl border p-3 text-left text-sm transition " +
        (selected
          ? "border-emerald-500 bg-emerald-50"
          : "border-zinc-200 hover:border-emerald-300 hover:bg-emerald-50/40")
      }
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-zinc-600">{label}</span>
      {children}
    </label>
  );
}
