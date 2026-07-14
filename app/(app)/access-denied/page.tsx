export default function AccessDeniedPage() {
  return (
    <div className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
      <h1 className="text-2xl font-semibold">Brak przypisanych sekcji</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        Administrator nie przyznał jeszcze dostępu do żadnej sekcji panelu. Skontaktuj się z administratorem kliniki.
      </p>
    </div>
  );
}
