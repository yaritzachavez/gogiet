export interface DBDeliveryTip {
  id: number;
  delivery_id: number;
  order_id: number;
  tip_amount: number;
  created_at: Date;
}
