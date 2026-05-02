export interface DBBusinessHours {
  id: number;
  business_id: number;
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  created_at: Date;
  updated_at: Date;
}
