import { redirect } from "next/navigation";

// Zakładka "Kalendarz" dla admina/recepcji została scalona z zakładką "Wizyty".
// Stary adres przekierowuje do widoku kalendarza w Wizytach.
export default function AdminCalendarPage() {
  redirect("/admin/visits?view=calendar");
}
