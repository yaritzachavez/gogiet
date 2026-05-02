export interface DBUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  profile_image_url?: string | null;
  avatar_url?: string | null;
  password_hash?: string;
  phone: string | null;
  is_verified: boolean;
  created_at: Date;
  updated_at: Date;
  status_id: number;
  roles?: string[];
}
