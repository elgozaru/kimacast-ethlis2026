-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ensSubname" TEXT,
    "capabilities" TEXT[],
    "sourcePolicy" TEXT NOT NULL DEFAULT 'author-authorized',
    "settings" JSONB NOT NULL,
    "hederaPayTo" TEXT,
    "reputationScore" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorProfile" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "profileHash" TEXT NOT NULL,
    "toneDescription" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentSource" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "author" TEXT,
    "canonicalUrl" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "storageUri" TEXT,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationResult" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "authorProfileId" TEXT,
    "sourceHash" TEXT NOT NULL,
    "authorProfileHash" TEXT,
    "outputStorageId" TEXT,
    "content" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "generationResultId" TEXT,
    "teaser" TEXT NOT NULL,
    "full" TEXT NOT NULL,
    "priceTinybars" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "publishedTweetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_ensSubname_key" ON "Agent"("ensSubname");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorProfile_profileHash_key" ON "AuthorProfile"("profileHash");

-- CreateIndex
CREATE UNIQUE INDEX "ContentSource_contentHash_key" ON "ContentSource"("contentHash");

-- AddForeignKey
ALTER TABLE "AuthorProfile" ADD CONSTRAINT "AuthorProfile_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentSource" ADD CONSTRAINT "ContentSource_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationResult" ADD CONSTRAINT "GenerationResult_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationResult" ADD CONSTRAINT "GenerationResult_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ContentSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationResult" ADD CONSTRAINT "GenerationResult_authorProfileId_fkey" FOREIGN KEY ("authorProfileId") REFERENCES "AuthorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_generationResultId_fkey" FOREIGN KEY ("generationResultId") REFERENCES "GenerationResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;
