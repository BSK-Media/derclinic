"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { StaffChat } from "@/components/staff-chat";

function ChatContent() {
  const params = useSearchParams();
  // key: kliknięcie powiadomienia z dzwonka otwiera rozmowę z wybraną osobą także wtedy, gdy czat jest już otwarty.
  const withId = params.get("with");
  return <StaffChat key={withId ?? "list"} initialWith={withId} />;
}

// Czat wewnętrzny personelu — każdy pracownik może napisać do każdego (administrator, manager, recepcja, specjaliści).
export default function ChatPage() {
  return (
    <React.Suspense fallback={<div className="p-6 text-sm text-zinc-500">Ładowanie…</div>}>
      <ChatContent />
    </React.Suspense>
  );
}
