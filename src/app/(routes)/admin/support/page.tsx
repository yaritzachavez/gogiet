import AdminChatPanel from "../components/AdminChatPanel";

export default function AdminSupportPage() {
  return (
    <main className="space-y-8 px-4 py-10 sm:px-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Soporte</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-300">
          Revisa chats de ayuda, comprobantes de transferencia y mensajes del
          sistema en un solo lugar.
        </p>
      </header>
      <AdminChatPanel />
    </main>
  );
}
