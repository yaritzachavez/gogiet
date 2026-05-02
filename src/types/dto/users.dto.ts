export interface CreateUserDTO {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  phone?: string;
  role_ids?: number[];
}

export interface UpdateUserDTO {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  is_verified?: boolean;
  status_id?: number;
  role_ids?: number[];
}
