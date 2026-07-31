-- AlterTable
ALTER TABLE "ContentSource" ADD COLUMN     "sourceType" TEXT NOT NULL DEFAULT 'text';

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "publishResults" JSONB;
