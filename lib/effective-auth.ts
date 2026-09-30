import { getAuthUser, type AuthUser } from "@/lib/auth-cookie";

export type EffectiveAuth = {
  user: AuthUser | null;
  adminUser: AuthUser | null;
  impersonating: boolean;
};

/**
 * Zwraca użytkownika bieżącej sesji.
 *
 * Wcześniej obsługiwało tu też "podszywanie się" administratora pod innego
 * pracownika na podstawie niepodpisanego ciasteczka z id konta. Żaden ekran
 * nie ustawiał już tego ciasteczka, a sam mechanizm omijał MFA i ślad audytowy
 * docelowego konta, więc został usunięty (audyt bezpieczeństwa).
 */
export async function getEffectiveAuth(): Promise<EffectiveAuth> {
  const user = await getAuthUser();
  return { user, adminUser: user, impersonating: false };
}
