INSERT OR REPLACE INTO business_categories (name, description, icon, created_at, updated_at)
VALUES
('Restaurante', 'Comida preparada y menu general', 'store', datetime('now'), datetime('now')),
('Tacos', 'Taquerias y antojitos mexicanos', 'utensils-crossed', datetime('now'), datetime('now')),
('Hamburguesas', 'Hamburguesas, hot dogs y comida rapida', 'burger', datetime('now'), datetime('now')),
('Pizza', 'Pizzerias y especialidades al horno', 'pizza', datetime('now'), datetime('now')),
('Pollo', 'Pollerias, alitas y rostizados', 'drumstick', datetime('now'), datetime('now')),
('Mariscos', 'Ceviches, cocteles y marisqueria', 'fish', datetime('now'), datetime('now')),
('Sushi', 'Sushi, ramen y comida asiatica', 'fish', datetime('now'), datetime('now')),
('Cafe y postres', 'Cafeterias, panaderias y reposteria', 'coffee', datetime('now'), datetime('now')),
('Bebidas', 'Jugos, licuados y bebidas preparadas', 'cup-soda', datetime('now'), datetime('now')),
('Farmacia', 'Medicamentos y articulos de farmacia', 'pill', datetime('now'), datetime('now')),
('Supermercado', 'Abarrotes, despensa y articulos del hogar', 'shopping-cart', datetime('now'), datetime('now')),
('Mascotas', 'Alimentos y accesorios para mascotas', 'paw-print', datetime('now'), datetime('now'));


USE gogi;

INSERT INTO product_categories (name, description) VALUES
('hamburguesas', 'Productos tipo hamburguesa'),
('pizzas', 'Productos tipo pizza'),
('bebidas', 'Bebidas frías o calientes'),
('postres', 'Pasteles y dulces'),
('snacks', 'Botanas'),
('cafeteria', 'Bebidas y snacks'),
('farmacia', 'Medicamentos'),
('supermercado', 'Abarrotes');

ALTER TABLE business ADD COLUMN logo_url TEXT;
email_verified