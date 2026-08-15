-- Absolute URL of the service's brand mark on kstacks.org.
-- Nullable: services that predate the catalogue sync simply have none yet, and
-- the frontend already falls back to a bundled asset or a generic icon.
ALTER TABLE "services" ADD COLUMN "logo_url" VARCHAR(300);
