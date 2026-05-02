export interface DBBusinessDetails {
  business_id: number;
  is_open_now: boolean;
  status_id: number;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}
