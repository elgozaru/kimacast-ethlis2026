import { Route, Routes } from "react-router-dom";
import { StoryPage } from "./pages/StoryPage";

export function App() {
  return (
    <Routes>
      <Route path="/p/:postId" element={<StoryPage />} />
    </Routes>
  );
}
