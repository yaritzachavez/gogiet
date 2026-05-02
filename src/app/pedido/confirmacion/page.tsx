"use client";
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import PedidoConfirmacionClient from "./PedidoConfirmacionClient";

export default function Page() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <PedidoConfirmacionClient />
    </Suspense>
  );
}


