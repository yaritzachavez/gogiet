export interface DBOrder {
  id: number;
  user_id: number;
  business_id: number;
  delivery_id: number | null;
  status_id: number;
  total_amount: number;
  payment_method: string;
  is_paid: boolean;
  delivery_commission: number;
  app_commission: number;
  created_at: Date;
  updated_at: Date;
}
