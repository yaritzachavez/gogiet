export interface DBUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  profile_image_url?: string | null;
  avatar_url?: string | null;
  password?: string;
  phone: string | null;
  is_verified: boolean;
  email_verified_at?: Date | string | null;
  created_at: Date;
  updated_at: Date;
  status_id: number;
  status?: string | null;
  is_active?: boolean;
  roles?: string[];
}
