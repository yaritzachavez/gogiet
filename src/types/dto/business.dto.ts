export interface CreateBusinessDTO {
  name: string;
  business_category_id: number;
  city: string;
  district: string;
  address: string;
  legal_name: string;
  tax_id: string;
  address_notes?: string;
}

export interface UpdateBusinessDTO extends Partial<CreateBusinessDTO> {
  status_id?: number;
}
