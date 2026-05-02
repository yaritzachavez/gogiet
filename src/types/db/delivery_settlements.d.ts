export interface DBDeliverySettlement {
  id: number;
  delivery_id: number;
  total_amount: number;
  start_period: Date;
  end_period: Date;
  created_at: Date;
  status_id: number;
}
