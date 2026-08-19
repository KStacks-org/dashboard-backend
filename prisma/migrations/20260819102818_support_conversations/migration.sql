-- CreateEnum
CREATE TYPE "SupportConversationStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportSenderType" AS ENUM ('REPORTER', 'STAFF');

-- CreateTable
CREATE TABLE "support_conversations" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "SupportConversationStatus" NOT NULL DEFAULT 'OPEN',
    "service_codename" VARCHAR(50) NOT NULL,
    "page_context" VARCHAR(300),
    "reporter_name" VARCHAR(100) NOT NULL,
    "reporter_email" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by_id" TEXT,

    CONSTRAINT "support_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_type" "SupportSenderType" NOT NULL,
    "staff_id" TEXT,
    "as_org" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_conversations_token_key" ON "support_conversations"("token");

-- CreateIndex
CREATE INDEX "support_conversations_status_updated_at_idx" ON "support_conversations"("status", "updated_at");

-- CreateIndex
CREATE INDEX "support_conversations_service_codename_idx" ON "support_conversations"("service_codename");

-- CreateIndex
CREATE INDEX "support_messages_conversation_id_created_at_idx" ON "support_messages"("conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "support_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
