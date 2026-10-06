export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-amber-50 px-6 font-sans text-stone-900">
      <section className="w-full max-w-xl rounded-2xl bg-white p-8 text-center shadow-sm sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-800">
          Cashless drink ordering
        </p>
        <h1 className="mt-4 text-5xl font-bold tracking-tight">BrewLite</h1>
        <p className="mt-4 text-lg text-stone-600">
          A quicker way to choose your drink and place an order.
        </p>
        <p className="mt-8 rounded-lg bg-amber-50 px-4 py-3 text-sm text-stone-600">
          Project starter is ready. The team will build the menu and ordering
          flow here.
        </p>
      </section>
    </main>
  );
}
