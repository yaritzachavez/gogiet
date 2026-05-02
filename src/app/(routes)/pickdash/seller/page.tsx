"use client";

import { BusinessManagerDashboard } from "@/components/business/BusinessManagerDashboard";
import { SupportChatWidget } from "@/components/support/SupportChatWidget";

export default function SellerPanelPage() {
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
