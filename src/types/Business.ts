export type BusinessStatus = "Verificado" | "Activo" | "Suspendido";
export type BusinessOrderStatus = "Entregado" | "En camino" | "Cancelado";

export interface BusinessOrder {
  id: string;
  cliente: string;
  total: number;
  estado: BusinessOrderStatus;
  fecha: string;
  metodo: "Efectivo" | "Tarjeta" | "Transferencia";
}

export interface BusinessSchedule {
  dias: string;
  apertura: string;
  cierre: string;
}

export interface BusinessRecord {
  id: number;
  nombre: string;
  categoria: string;
  ciudad: string;
  estado: BusinessStatus;
  telefono: string;
  contacto: string;
  creadoEn: string;
  direccion: string;
  referencias: string;
  horario: BusinessSchedule;
  pedidos: BusinessOrder[];
}

export interface BusinessOrdersTableProps {
  orders: BusinessOrder[];
}