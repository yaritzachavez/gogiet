export interface DBDeliveryMetric {
  id: number;
  delivery_id: number;
  order_id: number;
  distance_km: number;
  delivery_time_minutes: number;
  created_at: Date;
}
