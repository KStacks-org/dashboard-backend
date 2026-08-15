-- Roles become scoped. "ADMIN" was a single global flag whose only power was
-- roster management; it becomes SUPER_ADMIN, which holds every scope.
ALTER TYPE "UserRole" RENAME VALUE 'ADMIN' TO 'SUPER_ADMIN';

-- One admin scope held by one person. `scope` is either the literal "dashboard"
-- or a service codename. Stored as text, not a foreign key, because "dashboard"
-- is not a service and a grant should survive an upstream rename.
CREATE TABLE "admin_grants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scope" VARCHAR(50) NOT NULL,
    "granted_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_grants_user_id_scope_key" ON "admin_grants"("user_id", "scope");
CREATE INDEX "admin_grants_scope_idx" ON "admin_grants"("scope");

ALTER TABLE "admin_grants" ADD CONSTRAINT "admin_grants_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_grants" ADD CONSTRAINT "admin_grants_granted_by_id_fkey"
    FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
