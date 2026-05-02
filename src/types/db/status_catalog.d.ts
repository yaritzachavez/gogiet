export interface DBStatusCatalog {
  id: number;
  entity: string;
  code: string;
  label: string;
  sort_order: number;
  is_final: boolean;
  created_at: Date;
  updated_at: Date;
}
