"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role === "ADMIN") router.replace("/admin");
    else if (user.role === "RECEPTION") router.replace("/admin/appointments");
    else router.replace("/specialist");
  }, [user, loading, router]);

  return <div className="p-8 text-sm text-zinc-500">Przekierowanie…</div>;
}
