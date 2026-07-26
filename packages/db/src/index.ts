import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

let client: PrismaClient | undefined;

/// Lazy singleton so importing this package doesn't require DATABASE_URL to
/// be set unless a query is actually made - apps/resource-server only needs
/// this for dashboard-created posts and should keep working with zero DB
/// configured, serving only the hardcoded demo post (see posts.ts).
export function getDb(): PrismaClient {
  if (!client) client = new PrismaClient();
  return client;
}
