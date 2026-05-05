ALTER TABLE business
ADD COLUMN IF NOT EXISTS logo_url VARCHAR(255) NULL;

UPDATE business
SET logo_url = COALESCE(
  logo_url,
  NULLIF(avatar_url, '')
)
WHERE
  (
    logo_url IS NULL
    OR TRIM(logo_url) = ''
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'business'
      AND column_name = 'avatar_url'
  );
