export interface DBDeliveryPayment {
  id: number;
  delivery_id: number;
  order_id: number;
  amount: number;
  created_at: Date;
}
