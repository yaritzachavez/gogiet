import type { DBBusinessOwner } from "../db/business_owners";
import { DBBusiness } from "../db/business";
import { DBBusinessDetails } from "../db/business_details";
import { DBBusinessHours } from "../db/business_hours";

export interface BusinessOwnerReference
  extends Pick<DBBusinessOwner, "user_id"> {
  user_id: number | null;
}

export interface BusinessFull extends DBBusiness {
  description: string;
  business_owner: BusinessOwnerReference | null;
  details: DBBusinessDetails | null;
  hours: DBBusinessHours[];
}
