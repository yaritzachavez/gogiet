
import Link from "next/link";
import { useSearchParams } from "next/navigation";


export default function PedidoConfirmacionPage() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const pendingTransfer = searchParams.get("pendingTransfer") === "1";

  return (
    <main className="min-h-[70vh] bg-white/90 px-4 py-16 text-orange-950">
      <div className="mx-auto max-w-2xl rounded-3xl border border-orange-100 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-orange-600">
          {pendingTransfer ? "Transferencia pendiente" : "Pedido confirmado"}
        </p>
        <h1 className="mt-3 text-3xl font-semibold">
          {pendingTransfer
            ? "Tu pedido quedó pendiente de pago"
            : "Pedido creado correctamente"}
        </h1>
        <p className="mt-3 text-sm text-orange-900/75">
          {pendingTransfer
            ? orderId
              ? `Tu pedido #${orderId} fue registrado. Cuando reportes tu transferencia podremos validar el pago.`
              : "Tu pedido fue registrado y está pendiente de validación de pago."
            : orderId
              ? `Tu pedido #${orderId} ya fue registrado y está en proceso.`
              : "Tu pedido ya fue registrado y está en proceso."}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/shop"
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-orange-200 px-5 text-sm font-semibold text-orange-700 transition hover:bg-orange-50"
          >
            Seguir comprando
          </Link>
          {orderId ? (
            <Link
              href={`/api/orders/${orderId}`}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-orange-600 px-5 text-sm font-semibold text-white transition hover:bg-orange-700"
            >
              Ver pedido
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
