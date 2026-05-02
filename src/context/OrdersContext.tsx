"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type OrderStatus =
  | "Asignar repartidor"
  | "Listo para recoger"
  | "En camino"
  | "Completado";

type PaymentStatus = "Pagado" | "Pendiente de cobro";

type OrderLocation = {
  name?: string;
  address: string;
  neighborhood?: string;
};

type OrderItem = {
  name: string;
  quantity: number;
};

type OrderPayment = {
  method: string;
  status: PaymentStatus;
  amountToCollect: number;
};

type OrderCustomer = {
  name: string;
  phone: string;
};

export type Order = {
  id: string;
  customer: OrderCustomer;
  pickup: OrderLocation;
  dropoff: OrderLocation;
  status: OrderStatus;
  eta: string;
  items: OrderItem[];
  total: number;
  payment: OrderPayment;
  instructions: string;
  updatedAt: string;
  createdAt: string;
};

type OrdersContextType = {
  orders: Order[];
  addOrder: (order: Order) => void;
  updateOrder: (id: string, updates: Partial<Order>) => void;
};

const OrdersContext = createContext<OrdersContextType | undefined>(undefined);

const STORAGE_KEY = "gogieats:orders";

function minutesAgo(value: number) {
  const date = new Date();
  date.setMinutes(date.getMinutes() - value);
  return date.toISOString();
}

const seedOrders: Order[] = [
  {
    id: "ORD-4829",
    customer: { name: "María Rivera", phone: "+52 55 1234 5678" },
    pickup: {
      name: "Taquería El Paisa",
      address: "Av. Reforma 88",
      neighborhood: "Juárez, CDMX",
    },
    dropoff: {
      address: "Av. Reforma 106, Piso 3",
      neighborhood: "Juárez, CDMX",
    },
    status: "En camino",
    eta: "8 min",
    items: [
      { name: "Tacos al pastor", quantity: 3 },
      { name: "Agua mineral", quantity: 1 },
    ],
    total: 259,
    payment: { method: "Tarjeta", status: "Pagado", amountToCollect: 0 },
    instructions: "Tocar timbre y dejar en recepción",
    updatedAt: minutesAgo(3),
    createdAt: minutesAgo(15),
  },
  {
    id: "ORD-4830",
    customer: { name: "Luis Hernández", phone: "+52 55 9987 1123" },
    pickup: {
      name: "Green Bowl",
      address: "Av. Álvaro Obregón 21",
      neighborhood: "Roma Norte, CDMX",
    },
    dropoff: {
      address: "Calle Colima 45",
      neighborhood: "Roma Norte, CDMX",
    },
    status: "Listo para recoger",
    eta: "Listo",
    items: [
      { name: "Poke bowl de salmón", quantity: 1 },
      { name: "Té helado", quantity: 1 },
    ],
    total: 195,
    payment: {
      method: "Efectivo",
      status: "Pendiente de cobro",
      amountToCollect: 195,
    },
    instructions: "Confirmar cambio de $100",
    updatedAt: minutesAgo(6),
    createdAt: minutesAgo(25),
  },
  {
    id: "ORD-4831",
    customer: { name: "Karen López", phone: "+52 55 8844 0099" },
    pickup: {
      name: "La Ensaladería",
      address: "Av. Universidad 900",
      neighborhood: "Del Valle, CDMX",
    },
    dropoff: {
      address: "Insurgentes Sur 742",
      neighborhood: "Del Valle, CDMX",
    },
    status: "Asignar repartidor",
    eta: "—",
    items: [
      { name: "Ensalada César", quantity: 1 },
      { name: "Sopa de tomate", quantity: 1 },
    ],
    total: 172,
    payment: { method: "Tarjeta", status: "Pagado", amountToCollect: 0 },
    instructions: "Llamar al llegar",
    updatedAt: minutesAgo(12),
    createdAt: minutesAgo(38),
  },
];

export function OrdersProvider({ children }: { children: React.ReactNode }) {
  const [orders, setOrders] = useState<Order[]>(seedOrders);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Order[];
        setOrders(parsed);
      }
    } catch (error) {
      console.error("No se pudieron cargar los pedidos almacenados", error);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    } catch (error) {
      console.error("No se pudieron guardar los pedidos", error);
    }
  }, [orders, isHydrated]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as Order[];
        setOrders(parsed);
      } catch (error) {
        console.error("No se pudieron sincronizar los pedidos", error);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const contextValue = useMemo(
    () => ({
      orders,
      addOrder: (order: Order) => {
        setOrders((prev) => [order, ...prev]);
      },
      updateOrder: (id: string, updates: Partial<Order>) => {
        setOrders((prev) =>
          prev.map((order) =>
            order.id === id
              ? {
                  ...order,
                  ...updates,
                  updatedAt: updates.updatedAt ?? order.updatedAt,
                }
              : order,
          ),
        );
      },
    }),
    [orders],
  );

  return (
    <OrdersContext.Provider value={contextValue}>
      {children}
    </OrdersContext.Provider>
  );
}

export function useOrders() {
  const context = useContext(OrdersContext);
  if (!context)
    throw new Error("useOrders must be used within an OrdersProvider");
  return context;
}
