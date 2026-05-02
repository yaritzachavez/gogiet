"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider } from "@/context/AuthContext";
import { OrdersProvider } from "@/context/OrdersContext";

export default function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <OrdersProvider>{children}</OrdersProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
