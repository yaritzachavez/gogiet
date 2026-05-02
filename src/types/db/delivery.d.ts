export interface DBDelivery {
  id: number;
  user_id: number;
  status_id: number;
  vehicle_type_id: number;
  vehicle_plate: string | null;
  base_rate: number;
  accepts_tips: boolean;
  created_at: Date;
  updated_at: Date;
}
