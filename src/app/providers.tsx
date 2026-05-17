"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

import { AuthProvider } from "@/context/AuthContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { OrdersProvider } from "@/context/OrdersContext";

export default function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={qc}>
      <NotificationProvider>
        <AuthProvider>
          <OrdersProvider>{children}</OrdersProvider>
        </AuthProvider>
      </NotificationProvider>
    </QueryClientProvider>
  );
}
