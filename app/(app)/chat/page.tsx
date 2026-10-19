"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { StaffChat } from "@/components/staff-chat";

function ChatContent() {
  const params = useSearchParams();
  return <StaffChat initialWith={params.get("with")} />;
}

// Czat wewnętrzny personelu — każdy pracownik może napisać do każdego (administrator, manager, recepcja, specjaliści).
export default function ChatPage() {
  return (
    <React.Suspense fallback={<div className="p-6 text-sm text-zinc-500">Ładowanie…</div>}>
      <ChatContent />
    </React.Suspense>
  );
}
