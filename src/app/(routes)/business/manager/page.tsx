"use client";

import { BusinessAdminDashboard } from "@/components/business/BusinessAdminDashboard";
import { SupportChatWidget } from "@/components/support/SupportChatWidget";

export default function ManagerPage() {
  return (
    <>
      <BusinessAdminDashboard />
      <SupportChatWidget
        requesterRole="negocio"
        title="Soporte para negocio"
        description="Envía mensajes al Administrador General desde el panel del negocio y recibe la respuesta aquí mismo."
        floating
      />
    </>
  );
}
