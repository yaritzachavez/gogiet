CREATE TABLE IF NOT EXISTS zonas_envio (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  distancia_km DECIMAL(5,2) NOT NULL,
  activo BOOLEAN DEFAULT TRUE,
  UNIQUE KEY uk_zonas_envio_nombre (nombre)
);

INSERT INTO zonas_envio (nombre, tipo, distancia_km, activo)
VALUES
  ('Mazamitla Cabecera', 'zona', 3.5, TRUE),
  ('Mazamitla Centro', 'zona', 3.3, TRUE),
  ('Las Colonias', 'zona', 3.3, TRUE),
  ('El Oricho', 'rancho', 3.6, TRUE),
  ('La Gloria', 'rancho', 3.4, TRUE),
  ('Barrio Alto', 'barrio', 3.3, TRUE),
  ('El Copor', 'rancho', 3.3, TRUE),
  ('La Redura', 'rancho', 3.7, TRUE),
  ('El Chorro', 'rancho', 4.0, TRUE),
  ('Pinos', 'rancho', 5.0, TRUE),
  ('El Pencho Chico', 'rancho', 0.0, TRUE),
  ('La Estacada', 'rancho', 2.0, TRUE),
  ('Llano de los Toros', 'rancho', 2.0, TRUE),
  ('Puerta del Zapatero', 'rancho', 5.0, TRUE),
  ('Cuarto de Cuevas', 'rancho', 4.5, TRUE),
  ('El Pandito', 'rancho', 4.0, TRUE),
  ('El Charco', 'rancho', 3.0, TRUE),
  ('El Tigre', 'rancho', 6.0, TRUE)
ON DUPLICATE KEY UPDATE
  tipo = VALUES(tipo),
  distancia_km = VALUES(distancia_km),
  activo = VALUES(activo);
