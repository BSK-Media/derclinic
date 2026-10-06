import { redirect } from "next/navigation";
import { getAuthUser, getStaffSession } from "@/lib/auth-cookie";
import {
  firstAllowedSidebarHref,
  hasSidebarPermission,
  sidebarHref,
} from "@/lib/sidebar-permissions";

export default async function Home() {
  const user = await getAuthUser();

  if (!user) {
    // Konto wspólne (recepcja): hasło i 2FA są za nami, brakuje tylko PIN-u.
    // getAuthUser takiej sesji nie zwraca, więc bez tego sprawdzenia "/"
    // odsyłałoby z powrotem na logowanie.
    const session = await getStaffSession();
    redirect(session?.operatorPending ? "/login/pin" : "/login");
  }

  if (hasSidebarPermission(user.role, user.sidebarPermissions, "appointments")) {
    redirect(sidebarHref("appointments", user.role));
  }

  redirect(firstAllowedSidebarHref(user.role, user.sidebarPermissions));
}
