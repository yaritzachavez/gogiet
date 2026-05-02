export interface DBOrderItem {
  id: number;
  order_id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  subtotal: number;
  promotion_amount: number | null;
  discount: number | null;
  total: number;
}
