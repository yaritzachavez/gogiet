export type CourierStatus = "Activo" | "En descanso" | "Suspendido";
export type CourierAssignmentStatus = "Entregado" | "En ruta" | "Cancelado";

export interface CourierAssignment {
  id: string;
  negocio: string;
  pedido: string;
  total: number;
  estado: CourierAssignmentStatus;
  fecha: string;
  direccionEntrega: string;
}

export interface CourierSchedule {
  turno: string;
  inicio: string;
  fin: string;
  zona: string;
}

export interface CourierRecord {
  id: number;
  nombre: string;
  telefono: string;
  email: string;
  estado: CourierStatus;
  vehiculo: string;
  placas: string;
  inicioEnGogiEats: string;
  promedioEntrega: string;
  calificacion: number;
  horario: CourierSchedule;
  asignaciones: CourierAssignment[];
}

export interface CourierAssignmentsTableProps {
  assignments: CourierAssignment[];
}

export interface CourierHeaderProps {
  courierId: number;
  name: string;
  zone: string;
  shift: string;
  status: CourierStatus;
}