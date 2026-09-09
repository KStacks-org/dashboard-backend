-- Existing dashboard users keep their access. The final default is false so
-- adding an identity in the admin directory never grants dashboard membership
-- implicitly.
ALTER TABLE "users"
ADD COLUMN "has_dashboard_access" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "users"
ALTER COLUMN "has_dashboard_access" SET DEFAULT false;
