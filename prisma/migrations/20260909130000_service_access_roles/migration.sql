CREATE TABLE "service_access_roles" (
    "id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_access_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_access_roles_service_id_name_key"
ON "service_access_roles"("service_id", "name");

CREATE INDEX "service_access_roles_service_id_idx"
ON "service_access_roles"("service_id");

ALTER TABLE "service_access_roles"
ADD CONSTRAINT "service_access_roles_service_id_fkey"
FOREIGN KEY ("service_id") REFERENCES "services"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "admin_grants"
ALTER COLUMN "scope" TYPE VARCHAR(100);
