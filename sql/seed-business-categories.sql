INSERT INTO business_categories (name, description, icon, created_at, updated_at)
VALUES
  ('Restaurante', 'Comida preparada y menu general', 'store', NOW(), NOW()),
  ('Tacos', 'Taquerias y antojitos mexicanos', 'utensils-crossed', NOW(), NOW()),
  ('Hamburguesas', 'Hamburguesas, hot dogs y comida rapida', 'burger', NOW(), NOW()),
  ('Pizza', 'Pizzerias y especialidades al horno', 'pizza', NOW(), NOW()),
  ('Pollo', 'Pollerias, alitas y rostizados', 'drumstick', NOW(), NOW()),
  ('Mariscos', 'Ceviches, cocteles y marisqueria', 'fish', NOW(), NOW()),
  ('Sushi', 'Sushi, ramen y comida asiatica', 'fish', NOW(), NOW()),
  ('Cafe y postres', 'Cafeterias, panaderias y reposteria', 'coffee', NOW(), NOW()),
  ('Bebidas', 'Jugos, licuados y bebidas preparadas', 'cup-soda', NOW(), NOW()),
  ('Farmacia', 'Medicamentos y articulos de farmacia', 'pill', NOW(), NOW()),
  ('Supermercado', 'Abarrotes, despensa y articulos del hogar', 'shopping-cart', NOW(), NOW()),
  ('Mascotas', 'Alimentos y accesorios para mascotas', 'paw-print', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  description = VALUES(description),
  icon = VALUES(icon),
  updated_at = NOW();
