-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SponsoredProjectStatus" AS ENUM ('PROPOSED', 'IN_REVIEW', 'ACTIVE', 'LAUNCHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "health_check_url" VARCHAR(300),
ADD COLUMN     "overview" TEXT,
ADD COLUMN     "owner_id" TEXT,
ADD COLUMN     "repo_url" VARCHAR(300);

-- AlterTable
ALTER TABLE "subtasks" ADD COLUMN     "assignee_id" TEXT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "reference" SERIAL NOT NULL,
ADD COLUMN     "status" "TaskStatus" NOT NULL DEFAULT 'TODO';

-- CreateTable
CREATE TABLE "service_health_checks" (
    "id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "is_up" BOOLEAN NOT NULL,
    "status_code" INTEGER,
    "response_time_ms" INTEGER,
    "error" VARCHAR(300),
    "checked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_health_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_comments" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_links" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "url" VARCHAR(2000) NOT NULL,
    "label" VARCHAR(120),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsored_projects" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "owner_name" VARCHAR(120) NOT NULL,
    "contact" VARCHAR(200),
    "project_url" VARCHAR(300),
    "repo_url" VARCHAR(300),
    "status" "SponsoredProjectStatus" NOT NULL DEFAULT 'PROPOSED',
    "resources" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sponsored_projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_health_checks_service_id_checked_at_idx" ON "service_health_checks"("service_id", "checked_at");

-- CreateIndex
CREATE INDEX "task_comments_task_id_created_at_idx" ON "task_comments"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "task_comments_author_id_idx" ON "task_comments"("author_id");

-- CreateIndex
CREATE INDEX "task_links_task_id_idx" ON "task_links"("task_id");

-- CreateIndex
CREATE INDEX "sponsored_projects_status_idx" ON "sponsored_projects"("status");

-- CreateIndex
CREATE INDEX "services_owner_id_idx" ON "services"("owner_id");

-- CreateIndex
CREATE INDEX "subtasks_assignee_id_idx" ON "subtasks"("assignee_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_reference_key" ON "tasks"("reference");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_health_checks" ADD CONSTRAINT "service_health_checks_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

