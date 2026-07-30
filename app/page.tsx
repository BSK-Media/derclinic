import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth-cookie";
import {
  firstAllowedSidebarHref,
  hasSidebarPermission,
  sidebarHref,
} from "@/lib/sidebar-permissions";

export default async function Home() {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  if (hasSidebarPermission(user.role, user.sidebarPermissions, "appointments")) {
    redirect(sidebarHref("appointments", user.role));
  }

  redirect(firstAllowedSidebarHref(user.role, user.sidebarPermissions));
}
