ALTER TABLE "services"
ADD COLUMN "access_scope_key" VARCHAR(50);

-- Derive the immutable key once from the current public service name.
UPDATE "services"
SET "access_scope_key" = TRIM(BOTH '-' FROM REGEXP_REPLACE(UPPER("name"), '[^A-Z0-9]+', '-', 'g'));

ALTER TABLE "services"
ALTER COLUMN "access_scope_key" SET NOT NULL;

CREATE UNIQUE INDEX "services_access_scope_key_key"
ON "services"("access_scope_key");

-- Convert grants written by both earlier formats. Dashboard is deliberately
-- unchanged because it is an app scope, not a service role.
UPDATE "admin_grants" AS grant_row
SET "scope" = service."access_scope_key" || '-ADMIN'
FROM "services" AS service
WHERE grant_row."scope" = service."codename";

UPDATE "admin_grants" AS grant_row
SET "scope" = service."access_scope_key" || '-' || SPLIT_PART(grant_row."scope", '/', 2)
FROM "services" AS service
WHERE grant_row."scope" LIKE service."codename" || '/%';
