export interface DBBusinessOwner {
  id: number;
  business_id: number;
  user_id: number;
  invited_by: number;
  created_at: Date;
  updated_at: Date;
  status_id: number;
}
