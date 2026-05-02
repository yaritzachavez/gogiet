import { DBBusiness } from "../db/business";
import { DBBusinessDetails } from "../db/business_details";
import { DBBusinessHours } from "../db/business_hours";

export interface BusinessFull extends DBBusiness {
  description: string;
  business_owner: any;
  details: DBBusinessDetails | null;
  hours: DBBusinessHours[];
}
