export type DeliveryStatus =
  | "En camino"
  | "En entrega"
  | "Listo para recoger"
  | "Pendiente"
  | "Recogido"
  | "Completado";

export interface DeliveryAddress {
  street: string;
  neighborhood: string;
  city: string;
  references: string;
  latitude?: number | null;
  longitude?: number | null;
  fullAddress?: string;
}

export interface DeliveryContact {
  name: string;
  phone: string;
}

export interface DeliveryOrderItem {
  id: number;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
}

export interface DeliveryOrder {
  id: string;
  status: DeliveryStatus;
  eta: string;
  paymentMethod: string;
  amount: number;
  businessName?: string;
  address: DeliveryAddress;
  contact: DeliveryContact;
  folio?: string;
  zoneName?: string;
  items?: DeliveryOrderItem[];
  notes?: string;
  fullAddress?: string;
  assignmentStatus?: string;
  canRespond?: boolean;
  canReject?: boolean;
  isAvailableDelivery?: boolean;
}

export interface DeliverySchedule {
  shiftLabel: string;
  shiftWindow: string;
  startTime?: string;
  endTime?: string;
  hoursWorked?: string;
  breakWindow?: string;
  nextCheckIn: string;
  coverageZone: string;
}

export interface DeliveryEarnings {
  currency: string;
  today: number;
  weekToDate: number;
  tips: number;
  goal: number;
  percentageToGoal?: number;
  comparisonToYesterday?: number;
}

export interface DeliveryHistoryEntry {
  id: string;
  folio: string;
  businessName: string;
  customerName: string;
  customerPhone: string;
  fullAddress: string;
  paymentMethod: string;
  total: number;
  deliveryFee: number;
  driverEarning: number;
  tip: number;
  deliveredAt: string;
  status: string;
}

export interface DeliveryNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp: string;
  createdAt?: string;
  status?: string;
  orderId?: number | null;
  folio?: string | null;
  unread?: boolean;
}
