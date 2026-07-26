import { useParams } from "react-router-dom";
import { StoryUnlock } from "../components/StoryUnlock";

// The page an Instagram bio-link / story link points at, e.g. /p/abc123.
export function StoryPage() {
  const { postId } = useParams<{ postId: string }>();
  if (!postId) return null;
  return <StoryUnlock postId={postId} />;
}
