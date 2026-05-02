export interface DBOrderNote {
  id: number;
  order_id: number;
  client_note: string | null;
  business_note: string | null;
  delivery_note: string | null;
}
