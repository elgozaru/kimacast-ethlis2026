import { StoryUnlock } from "./StoryUnlock";

// Next.js 15 server components receive route params as a Promise; keeping
// this file a server component (no "use client") and handing the resolved
// postId down to a client child avoids the ambiguity of unwrapping that
// Promise inside a Client Component.
export default async function StoryPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  return <StoryUnlock postId={postId} />;
}
