import { CourierList } from "../components/CourierList";

export default function AdminRepartosPage() {
  return (
    <main className="space-y-8 px-4 py-10 sm:px-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Repartos</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-300">
          Supervisa la flota de repartidores, revisa asignaciones recientes y
          métricas de desempeño.
        </p>
      </header>
      <CourierList />
    </main>
  );
}
