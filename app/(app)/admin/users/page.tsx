"use client";

import useSWR from "swr";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { LocationSelect } from "@/components/location-select";
import { useAuth } from "@/components/auth-provider";
import { validatePassword } from "@/lib/password-policy";
import { manageableRoles } from "@/lib/roles";
import { OperatorsDialog } from "@/components/operators-dialog";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Role = "ADMIN" | "MANAGER" | "RECEPTION" | "SPECIALIST";
type U = { id: string; login: string; name: string; role: Role; email?: string | null; payoutPercent?: number; location?: string | null; locationId: string; mfaEnabledAt?: string | null };

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  MANAGER: "Manager",
  RECEPTION: "Recepcja",
  SPECIALIST: "Specjalista",
};

// Losowe hasło tymczasowe, np. "k7Qm-9xTz-4pLw-Vb2R" — bez znaków łatwych do
// pomylenia przy przepisywaniu (0/O, 1/l/I).
function generateTemporaryPassword() {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]);
  return [0, 4, 8, 12].map((start) => chars.slice(start, start + 4).join("")).join("-");
}

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const { data, mutate, isLoading } = useSWR("/api/admin/users", fetcher);
  // Administrator zarządza wszystkim; manager zakłada i obsługuje tylko recepcję
  // i specjalistów w swojej lokalizacji.
  const isAdmin = me?.role === "ADMIN";
  const creatableRoles = manageableRoles(me?.role);

  const [login, setLogin] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("SPECIALIST");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [payoutPercent, setPayoutPercent] = useState("50");
  const [locationId, setLocationId] = useState("grodzisk-mazowiecki");
  const [saving, setSaving] = useState(false);
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);
  // Konto wspólne recepcji: osoby i ich PIN-y (tylko administrator).
  const [operatorsFor, setOperatorsFor] = useState<{ id: string; login: string; name: string } | null>(null);
  // Hasło tymczasowe po resecie — pokazywane administratorowi tylko raz.
  const [temporary, setTemporary] = useState<{ login: string; name: string; password: string } | null>(null);

  async function create() {
    if (!password && !email.trim()) {
      return toast.error("Podaj adres e-mail (pracownik dostanie link do ustawienia hasła) albo hasło startowe.");
    }
    if (password) {
      const passwordIssue = validatePassword(password, { login, name, email });
      if (passwordIssue) return toast.error(passwordIssue);
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          login: login.trim(),
          name: name.trim(),
          role,
          email: email.trim(),
          password,
          payoutPercent: role === "SPECIALIST" ? Number(payoutPercent) : undefined,
          // Administrator nie ma lokalizacji, a manager zakłada konta w swojej.
          locationId: isAdmin && role !== "ADMIN" ? locationId : undefined,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) {
        toast.error(out?.message || "Nie udało się założyć konta.");
        return;
      }
      const created = `Konto „${login.trim()}” założone (${ROLE_LABELS[role]}).`;
      if (out.emailSent) {
        toast.success(`${created} Wysłano e-mail z loginem i linkiem do ustawienia hasła na ${email.trim()}.`);
      } else if (email.trim()) {
        // Konto istnieje, ale wiadomość nie wyszła — admin musi przekazać dostęp sam.
        toast.warning(
          `${created} Nie udało się wysłać e-maila powitalnego (szczegóły: Poczta e-mail → dziennik wysyłek). ${
            out.startPasswordSet
              ? "Przekaż pracownikowi login i hasło startowe."
              : "Użyj „Resetuj hasło” na liście, żeby dostać hasło tymczasowe do przekazania."
          }`,
          { duration: 15000 },
        );
      } else {
        toast.success(`${created} Przekaż pracownikowi login i hasło startowe.`);
      }
      setLogin(""); setName(""); setEmail(""); setPassword(""); setPayoutPercent("50");
      mutate();
    } finally {
      setSaving(false);
    }
  }

  // Zmiana roli, w tym nadanie i odebranie uprawnień administratora (wymaga
  // ponownego MFA administratora — okno pojawi się samo).
  async function changeRole(u: U, nextRole: Role) {
    if (nextRole === u.role) return;
    const lines = [`Zmienić rolę konta „${u.login}” (${u.name}) z „${ROLE_LABELS[u.role]}” na „${ROLE_LABELS[nextRole]}”?`];
    if (nextRole === "ADMIN") {
      lines.push("Administrator ma pełny dostęp: wszystkie lokalizacje, dane pacjentów, rozliczenia, konta pracowników i logi.");
    }
    if (u.role === "SPECIALIST") {
      lines.push("Uwaga: to konto przestanie być specjalistą — zniknie z rezerwacji online i z listy specjalistów w kalendarzu.");
    }
    lines.push("Pracownik zostanie wylogowany i zaloguje się ponownie z nową rolą.");
    if (!confirm(lines.join("\n\n"))) return;

    setChangingRoleId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zmienić roli.");
      toast.success(`${u.name}: rola zmieniona na „${ROLE_LABELS[nextRole]}”.`);
      mutate();
    } finally {
      setChangingRoleId(null);
    }
  }

  // Reset hasła pracownika: system losuje hasło tymczasowe, administrator
  // przekazuje je pracownikowi, a ten przy pierwszym logowaniu ustawia własne.
  // (Wymaga ponownego MFA administratora — okno pojawi się samo.)
  async function resetPassword(u: U) {
    if (
      !confirm(
        `Zresetować hasło konta „${u.login}” (${u.name})?\n\nDotychczasowe hasło przestanie działać, a pracownik zostanie wylogowany ze wszystkich urządzeń. Zobaczysz hasło tymczasowe do przekazania pracownikowi.`,
      )
    ) {
      return;
    }
    let password = generateTemporaryPassword();
    while (validatePassword(password, { login: u.login, name: u.name, email: u.email })) {
      password = generateTemporaryPassword();
    }
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zresetować hasła.");
    setTemporary({ login: u.login, name: u.name, password });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Procedury bezpieczeństwa (wymagają ponownego MFA administratora — okno pojawi się samo).
  async function security(u: U, action: "reset_mfa" | "revoke_sessions") {
    const question =
      action === "reset_mfa"
        ? `Zresetować logowanie dwuskładnikowe konta „${u.login}”? Pracownik zostanie wylogowany i przy następnym logowaniu skonfiguruje MFA od nowa. Zrób to tylko po potwierdzeniu tożsamości pracownika.`
        : `Wylogować „${u.login}” ze wszystkich urządzeń?`;
    if (!confirm(question)) return;
    const res = await fetch(`/api/admin/users/${u.id}/security`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
    toast.success(action === "reset_mfa" ? "Zresetowano MFA" : `Wylogowano (${out.revokedSessions} sesji)`);
    mutate();
  }

  async function remove(u: U) {
    if (!confirm(`Trwale usunąć konto „${u.login}” (${u.name})? Tej operacji nie można cofnąć.`)) return;
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się usunąć konta.");
    toast.success("Usunięto");
    mutate();
  }

  const users: U[] = data?.users ?? [];
  const adminCount = users.filter((u) => u.role === "ADMIN").length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/settings" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-white">
          ← Ustawienia
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Konta pracowników</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Zakładanie kont i role. Administratorów może być kilku — każdy ma pełny dostęp do systemu.
        </p>
      </div>

      {temporary ? (
        <Card className="space-y-3 border-emerald-300 p-4 dark:border-emerald-500/40" role="status">
          <div className="font-medium">
            Hasło tymczasowe dla konta „{temporary.login}” ({temporary.name})
          </div>
          <div className="select-all rounded-lg border bg-zinc-50 p-3 text-center font-mono text-lg dark:bg-zinc-900">
            {temporary.password}
          </div>
          <p className="text-sm text-zinc-500">
            Przekaż je pracownikowi bezpiecznym kanałem. Przy pierwszym logowaniu ustawi własne hasło. Po
            zamknięciu tego okna hasła nie da się ponownie wyświetlić — w razie potrzeby zresetuj je jeszcze raz.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigator.clipboard
                  ?.writeText(temporary.password)
                  .then(() => toast.success("Skopiowano hasło"))
                  .catch(() => toast.error("Nie udało się skopiować — zaznacz hasło ręcznie."))
              }
            >
              Kopiuj hasło
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTemporary(null)}>
              Zamknij
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="p-4 space-y-4">
        <div className="font-medium">Dodaj konto</div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Login</Label>
            <Input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="np. anna.kowalska" autoComplete="off" />
          </div>
          <div className="space-y-2">
            <Label>Imię i nazwisko</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Anna Kowalska" />
          </div>
          <div className="space-y-2">
            <Label>Rola</Label>
            <Select value={role} onValueChange={(value) => setRole(value as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {creatableRoles.map((value) => (
                  <SelectItem key={value} value={value}>
                    {ROLE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {role === "ADMIN" ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Administrator ma pełny dostęp, także do kont pracowników i logów.
              </p>
            ) : null}
            {role === "MANAGER" ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Manager ma dostęp do wszystkiego poza logami, w swojej lokalizacji, i zakłada konta recepcji i specjalistów.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@..." type="email" />
            <p className="text-xs text-zinc-500">
              Na ten adres pracownik dostanie login i link do ustawienia własnego hasła (ważny 3 dni).
            </p>
          </div>
          <div className="space-y-2">
            <Label>Hasło startowe{email.trim() ? " (opcjonalnie)" : ""}</Label>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" />
            <p className="text-xs text-zinc-500">
              {email.trim()
                ? "Możesz zostawić puste — pracownik ustawi hasło linkiem z e-maila. Wpisane hasło jest tymczasowe."
                : "Wymagane, gdy nie podajesz adresu e-mail. Tymczasowe — przy pierwszym logowaniu pracownik ustawi własne hasło i logowanie dwuskładnikowe."}
            </p>
          </div>
          {role === "SPECIALIST" ? (
            <div className="space-y-2">
              <Label>% rozliczenia</Label>
              <Input value={payoutPercent} onChange={(e) => setPayoutPercent(e.target.value)} />
            </div>
          ) : null}
          {isAdmin && role !== "ADMIN" ? (
            <div className="space-y-2">
              <Label>Lokalizacja *</Label>
              <LocationSelect value={locationId} onChange={setLocationId} />
            </div>
          ) : null}
          {!isAdmin ? (
            <p className="self-end text-xs text-zinc-500">Konto zostanie założone w Twojej lokalizacji.</p>
          ) : null}
        </div>
        <Button onClick={create} disabled={saving || login.trim().length < 2 || name.trim().length < 2 || (!password && !email.trim())}>
          {saving ? "Zapisywanie..." : "Dodaj konto"}
        </Button>
      </Card>

      <div className="rounded-xl border bg-white shadow-sm dark:bg-zinc-950">
        <div className="p-4 border-b font-medium">
          Lista{users.length ? ` — ${users.length} kont, w tym administratorów: ${adminCount}` : ""}
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="p-3">Login</th>
                <th className="p-3">Nazwa</th>
                <th className="p-3">Rola</th>
                <th className="p-3">Email</th>
                <th className="p-3">Lokalizacja</th>
                <th className="p-3">% (specjalista)</th>
                <th className="p-3">2FA</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td className="p-3 text-zinc-500" colSpan={8}>Ładowanie...</td></tr>
              )}
              {!isLoading && users.length === 0 && (
                <tr><td className="p-3 text-zinc-500" colSpan={8}>Brak użytkowników.</td></tr>
              )}
              {users.map((u) => {
                const isMe = u.id === me?.id;
                return (
                  <tr key={u.id} className="border-t">
                    <td className="p-3 font-medium">
                      {u.login}
                      {isMe ? <span className="ml-2 text-xs font-normal text-zinc-500">(Ty)</span> : null}
                    </td>
                    <td className="p-3">{u.name}</td>
                    <td className="p-3">
                      {isMe ? (
                        // Własnej roli nie da się zmienić — może to zrobić inny administrator.
                        <span title="Swoją rolę może zmienić tylko inny administrator">{ROLE_LABELS[u.role] ?? u.role}</span>
                      ) : !isAdmin ? (
                        // Rolę zmienia tylko administrator.
                        <span>{ROLE_LABELS[u.role] ?? u.role}</span>
                      ) : (
                        <select
                          value={u.role}
                          disabled={changingRoleId === u.id}
                          onChange={(e) => changeRole(u, e.target.value as Role)}
                          aria-label={`Rola konta ${u.login}`}
                          className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                        >
                          <option value="ADMIN">Administrator</option>
                          <option value="MANAGER">Manager</option>
                          <option value="RECEPTION">Recepcja</option>
                          <option value="SPECIALIST">Specjalista</option>
                        </select>
                      )}
                    </td>
                    <td className="p-3">{u.email ?? "—"}</td>
                    <td className="p-3">{u.role === "ADMIN" ? "Wszystkie" : (u.location ?? "—")}</td>
                    <td className="p-3">{u.role === "SPECIALIST" ? (u.payoutPercent ?? 0) + "%" : "—"}</td>
                    <td className="p-3">
                      {u.mfaEnabledAt ? (
                        <span className="text-emerald-600">włączone</span>
                      ) : (
                        <span className="text-amber-600">skonfiguruje przy logowaniu</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => security(u, "revoke_sessions")}>
                          Wyloguj wszędzie
                        </Button>
                        {!isMe ? (
                          <Button variant="outline" size="sm" onClick={() => resetPassword(u)}>
                            Resetuj hasło
                          </Button>
                        ) : null}
                        {isAdmin && u.role === "RECEPTION" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setOperatorsFor({ id: u.id, login: u.login, name: u.name })}
                          >
                            Osoby i PIN-y
                          </Button>
                        ) : null}
                        {isAdmin && u.mfaEnabledAt && !isMe ? (
                          <Button variant="outline" size="sm" onClick={() => security(u, "reset_mfa")}>
                            Reset 2FA
                          </Button>
                        ) : null}
                        {isAdmin && !isMe ? (
                          <Button variant="destructive" size="sm" onClick={() => remove(u)}>Usuń</Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <OperatorsDialog
        account={operatorsFor}
        onOpenChange={(open) => {
          if (!open) setOperatorsFor(null);
        }}
      />
    </div>
  );
}
