"use client";

import { BusinessManagerDashboard } from "@/components/business/BusinessManagerDashboard";
import { SupportChatWidget } from "@/components/support/SupportChatWidget";
import { useAuth } from "@/context/AuthContext";
import { canAccessPanel } from "@/lib/panel-access";

export default function SellerPanelPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6ebdd] px-4 text-[#222222]">
        <p className="rounded-2xl border border-[#e98a4a]/25 bg-[#fffffd] px-6 py-4 text-sm font-bold shadow-[0_12px_35px_rgba(180,140,90,0.12)]">
          Validando acceso...
        </p>
      </main>
    );
  }

  if (!user || !canAccessPanel(user.roles, "seller")) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6ebdd] px-4 text-[#222222]">
        <section className="max-w-xl rounded-[28px] border border-[#e98a4a]/25 bg-[#fffffd] p-8 text-center shadow-[0_18px_50px_rgba(180,140,90,0.14)]">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[#e98a4a]">
            Acceso restringido
          </p>
          <h1 className="mt-4 text-3xl font-black">Panel de vendedor</h1>
          <p className="mt-3 text-sm leading-7 text-[#6b5a4b]">
            Solo una cuenta con rol VENDEDOR puede entrar a este panel.
          </p>
        </section>
      </main>
    );
  }

  return (
    <>
      <BusinessManagerDashboard mode="seller" />
      <SupportChatWidget
        requesterRole="vendedor"
        title="Soporte para vendedor"
        description="Habla con el Administrador General desde el panel de vendedor y sigue la conversación en tiempo real."
        floating
      />
    </>
  );
}
