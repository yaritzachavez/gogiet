CREATE TABLE IF NOT EXISTS zonas_envio (
  id INT NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(120) NOT NULL,
  tipo VARCHAR(40) NOT NULL DEFAULT 'zona',
  distancia_km DECIMAL(10, 2) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_zonas_envio_nombre (nombre),
  KEY idx_zonas_envio_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO zonas_envio (nombre, tipo, distancia_km, activo)
VALUES
  ('Mazamitla Cabecera', 'zona', 3.50, 1),
  ('Mazamitla Centro', 'zona', 3.30, 1),
  ('Las Colonias', 'zona', 3.30, 1),
  ('El Huricho', 'rancho', 3.60, 1),
  ('La Gloria', 'rancho', 3.40, 1),
  ('Barrio Alto', 'barrio', 3.30, 1),
  ('El Coporo', 'zona', 3.30, 1),
  ('La Herradura', 'zona', 3.70, 1),
  ('El Chorro', 'zona', 4.00, 1),
  ('Pinos', 'rancho', 5.00, 1),
  ('Epenche Chico', 'rancho', 0.00, 1),
  ('La Estacada', 'rancho', 2.00, 1),
  ('Llano de los Toros', 'rancho', 2.00, 1),
  ('Puerta del Zapatero', 'rancho', 5.00, 1),
  ('Puerto de Cuevas', 'rancho', 4.50, 1),
  ('El Pandito', 'zona', 4.00, 1),
  ('El Charco', 'zona', 3.00, 1),
  ('El Tigre', 'zona', 6.00, 1)
ON DUPLICATE KEY UPDATE
  tipo = VALUES(tipo),
  distancia_km = VALUES(distancia_km),
  activo = VALUES(activo),
  updated_at = CURRENT_TIMESTAMP;
