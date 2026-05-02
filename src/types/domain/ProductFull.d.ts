import { DBProduct } from "../db/products";
import { DBProductCategory } from "../db/product_categories";
import { DBPromotion } from "../db/promotions";

export interface ProductFull extends DBProduct {
  category: DBProductCategory | null;
  promotion: DBPromotion | null;
}
