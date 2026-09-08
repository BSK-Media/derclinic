"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TestContentPage() {
  const [loading, setLoading] = React.useState(false);
  const [log, setLog] = React.useState<string[] | null>(null);

  async function run() {
    setLoading(true);
    setLog(null);
    try {
      const response = await fetch("/api/admin/dev/load-test-content", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        toast.error(result?.message || "Nie udało się wgrać treści testowej");
        return;
      }
      setLog(result.log ?? []);
      toast.success("Gotowe — treść testowa wgrana.");
    } catch {
      toast.error("Nie udało się połączyć z serwerem");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Treść testowa — strona zabiegu</h1>
        <p className="text-sm text-zinc-500">
          Jednorazowa akcja: wgrywa opis usługi "Blefaroplastyka powiek górnych" i biogram Marty Szyderskiej,
          sparafrazowane z derclinic.pl, żeby przetestować szablon strony zabiegu/specjalisty w panelu klienta.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Wgraj treść testową</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={run} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Wgraj treść testową
          </Button>

          {log ? (
            <ul className="mt-4 space-y-1 text-sm text-zinc-600">
              {log.map((line, i) => (
                <li key={i}>• {line}</li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
