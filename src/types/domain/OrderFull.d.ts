import { DBOrder } from "../db/orders";
import { DBOrderItem } from "../db/order_items";
import { DBOrderNote } from "../db/order_notes";

export interface OrderFull extends DBOrder {
  items: DBOrderItem[];
  notes: DBOrderNote | null;
}
