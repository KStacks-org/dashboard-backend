-- KStack consumers expect lowercase `service-role` scope names. Dashboard is
-- represented like every other admin target instead of using a special bare
-- name.
UPDATE "services"
SET "access_scope_key" = LOWER("access_scope_key");

UPDATE "admin_grants"
SET "scope" = CASE
  WHEN LOWER("scope") = 'dashboard' THEN 'dashboard-admin'
  ELSE LOWER("scope")
END;

-- Scope collections stay relational in the dashboard database. At the JWT
-- boundary they are serialized into one comma-separated string.
