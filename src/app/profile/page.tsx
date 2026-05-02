import { SupportChatWidget } from "@/components/support/SupportChatWidget";

export default function ProfilePage() {
  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="mx-auto max-w-4xl rounded-[32px] border border-orange-100 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-orange-500">
          Perfil
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">
          Centro de soporte Gogi Eats
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-600">
          Si necesitas ayuda con un pedido, una transferencia o cualquier tema
          de tu cuenta, abre el chat y el Administrador General podrá
          responderte desde la bandeja central de soporte.
        </p>

        <div className="mt-8">
          <SupportChatWidget
            requesterRole="cliente"
            title="Soporte para usuario"
            description="Este chat está enlazado con la bandeja del Administrador General."
            buttonLabel="Abrir chat con soporte"
          />
        </div>
      </div>
    </main>
  );
}
