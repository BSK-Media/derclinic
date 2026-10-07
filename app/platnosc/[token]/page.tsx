"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PaymentRequestPanel } from "@/components/payment-request-panel";

// Płatność za wizytę z linku (potwierdzenie rezerwacji, panel klienta, maile).
// Token w adresie wskazuje wizytę, więc płacić może także gość bez konta.
export default function PaymentPage() {
  const params = useParams<{ token: string }>();
  const token = decodeURIComponent(String(params?.token ?? ""));

  return (
    <div className="min-h-screen bg-zinc-50 p-4">
      <div className="mx-auto max-w-xl space-y-5 py-6">
        <div className="flex items-center gap-3">
          <Image src="/derclinic-logo.webp" alt="DerClinic" width={56} height={56} priority />
          <div>
            <h1 className="text-xl font-bold text-zinc-900">Płatność za wizytę</h1>
            <p className="text-sm text-zinc-500">Wybierz metodę płatności i opłać rezerwację.</p>
          </div>
        </div>
        <PaymentRequestPanel token={token} />
        <Link href="/panel-klienta" className="block text-center text-sm text-zinc-500 underline">
          Przejdź do panelu klienta
        </Link>
      </div>
    </div>
  );
}
