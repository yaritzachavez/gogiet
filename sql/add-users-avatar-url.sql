ALTER TABLE users
ADD COLUMN avatar_url VARCHAR(255) NULL;

INSERT OR IGNORE INTO business_categories (name, description, icon, created_at, updated_at)
VALUES
('Restaurante', 'Comida preparada', 'store', datetime('now'), datetime('now')),
('Tacos', 'Taquerías', 'utensils-crossed', datetime('now'), datetime('now')),
('Hamburguesas', 'Comida rápida', 'burger', datetime('now'), datetime('now')),
('Pizza', 'Pizzería', 'pizza', datetime('now'), datetime('now')),
('Pollo', 'Pollería', 'drumstick', datetime('now'), datetime('now')),
('Mariscos', 'Marisquería', 'fish', datetime('now'), datetime('now')),
('Sushi', 'Comida japonesa', 'fish', datetime('now'), datetime('now')),
('Café', 'Cafetería', 'coffee', datetime('now'), datetime('now')),
('Bebidas', 'Jugos y bebidas', 'cup-soda', datetime('now'), datetime('now')),
('Farmacia', 'Medicamentos', 'pill', datetime('now'), datetime('now')),
('Supermercado', 'Abarrotes', 'shopping-cart', datetime('now'), datetime('now')),
('Mascotas', 'Productos para mascotas', 'paw-print', datetime('now'), datetime('now'));

USE gogi;

INSERT OR IGNORE INTO business_categories (name, description, icon, created_at, updated_at)
VALUES
('Restaurante', 'Comida preparada', 'store', datetime('now'), datetime('now')),
('Tacos', 'Taquerías', 'utensils-crossed', datetime('now'), datetime('now')),
('Hamburguesas', 'Comida rápida', 'burger', datetime('now'), datetime('now')),
('Pizza', 'Pizzería', 'pizza', datetime('now'), datetime('now')),
('Pollo', 'Pollería', 'drumstick', datetime('now'), datetime('now')),
('Mariscos', 'Marisquería', 'fish', datetime('now'), datetime('now')),
('Sushi', 'Comida japonesa', 'fish', datetime('now'), datetime('now')),
('Café', 'Cafetería', 'coffee', datetime('now'), datetime('now')),
('Bebidas', 'Jugos y bebidas', 'cup-soda', datetime('now'), datetime('now')),
('Farmacia', 'Medicamentos', 'pill', datetime('now'), datetime('now')),
('Supermercado', 'Abarrotes', 'shopping-cart', datetime('now'), datetime('now')),
('Mascotas', 'Productos para mascotas', 'paw-print', datetime('now'), datetime('now'));

OR IGNORE INTO...

INSERT OR IGNORE INTO business_categories (name, description, icon, created_at, updated_at)
VALUES
('Regalos', 'Regalos, detalles y sorpresas', 'gift', datetime('now'), datetime('now')),
('Florería', 'Flores, arreglos florales y plantas', 'flower', datetime('now'), datetime('now')),
('Tecnología', 'Celulares, accesorios y electrónicos', 'smartphone', datetime('now'), datetime('now')),
('Ropa', 'Ropa, calzado y accesorios', 'shirt', datetime('now'), datetime('now')),
('Ferretería', 'Herramientas, materiales y accesorios', 'hammer', datetime('now'), datetime('now')),
('Papelería', 'Útiles escolares, oficina e impresiones', 'book-open', datetime('now'), datetime('now')),
('Heladería', 'Helados, paletas y postres fríos', 'ice-cream', datetime('now'), datetime('now')),
('Frutas y verduras', 'Frutas, verduras y productos frescos', 'apple', datetime('now'), datetime('now'));