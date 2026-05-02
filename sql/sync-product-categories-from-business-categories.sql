-- Copia categorías de business_categories hacia product_categories
-- sin borrar existentes y sin duplicar por name.
--
-- Mantiene, cuando existen en ambas tablas:
-- - name
-- - description
-- - icon
-- - created_at
-- - updated_at

SET @copy_description = (
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'business_categories'
      AND column_name = 'description'
  )
  AND EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'product_categories'
      AND column_name = 'description'
  )
);

SET @copy_icon = (
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'business_categories'
      AND column_name = 'icon'
  )
  AND EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'product_categories'
      AND column_name = 'icon'
  )
);

SET @copy_created_at = (
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'business_categories'
      AND column_name = 'created_at'
  )
  AND EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'product_categories'
      AND column_name = 'created_at'
  )
);

SET @copy_updated_at = (
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'business_categories'
      AND column_name = 'updated_at'
  )
  AND EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'product_categories'
      AND column_name = 'updated_at'
  )
);

SET @insert_columns = CONCAT(
  'name',
  IF(@copy_description, ', description', ''),
  IF(@copy_icon, ', icon', ''),
  IF(@copy_created_at, ', created_at', ''),
  IF(@copy_updated_at, ', updated_at', '')
);

SET @select_columns = CONCAT(
  'TRIM(bc.name)',
  IF(@copy_description, ', bc.description', ''),
  IF(@copy_icon, ', bc.icon', ''),
  IF(@copy_created_at, ', COALESCE(bc.created_at, NOW())', ''),
  IF(@copy_updated_at, ', COALESCE(bc.updated_at, NOW())', '')
);

SET @sync_sql = CONCAT(
  'INSERT INTO product_categories (', @insert_columns, ') ',
  'SELECT ', @select_columns, ' ',
  'FROM business_categories bc ',
  'WHERE TRIM(COALESCE(bc.name, '''')) <> '''' ',
  'AND NOT EXISTS (',
  '  SELECT 1 ',
  '  FROM product_categories pc ',
  '  WHERE LOWER(TRIM(pc.name)) = LOWER(TRIM(bc.name))',
  ') ',
  'ORDER BY bc.name ASC'
);

PREPARE sync_stmt FROM @sync_sql;
EXECUTE sync_stmt;
DEALLOCATE PREPARE sync_stmt;

-- Verificación final
SELECT * FROM product_categories;
