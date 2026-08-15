-- Login moves from username to a university email address.
--
-- Existing rows are backfilled with a deliberately unusable address on the
-- reserved .invalid TLD (RFC 2606): those accounts keep working as assignees
-- but cannot be logged into until a real address is set, so a placeholder can
-- never collide with a genuine KAU mailbox and hand someone else access.

ALTER TABLE "users" ADD COLUMN "email" VARCHAR(200);

UPDATE "users" SET "email" = "username" || '@pending.invalid' WHERE "email" IS NULL;

ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
