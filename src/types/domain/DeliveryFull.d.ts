import { DBDelivery } from "../db/delivery";
import { DBVehicleType } from "../db/vehicle_types";

export interface DeliveryFull extends DBDelivery {
  vehicle: DBVehicleType;
}
