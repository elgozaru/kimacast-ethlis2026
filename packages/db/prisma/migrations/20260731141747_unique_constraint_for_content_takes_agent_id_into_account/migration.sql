/*
  Warnings:

  - A unique constraint covering the columns `[agentId,contentHash]` on the table `ContentSource` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "ContentSource_contentHash_key";

-- CreateIndex
CREATE UNIQUE INDEX "ContentSource_agentId_contentHash_key" ON "ContentSource"("agentId", "contentHash");
