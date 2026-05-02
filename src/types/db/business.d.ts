export interface DBBusiness {
  id: number;
  name: string;
  business_category_id: number;
  city: string;
  district: string;
  address: string;
  legal_name: string;
  tax_id: string;
  address_notes: string | null;
  created_at: Date;
  updated_at: Date;
  status_id: number;
}
