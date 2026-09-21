import { useNavigate } from "react-router-dom";
import { BrandMark } from "../components/BrandMark.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";

export default function NotFoundPage() {
  const navigate = useNavigate();
  useDocumentTitle("Page not found");
  return (
    <main className="center-page" id="main">
      <BrandMark />
      <h1>Page not found</h1>
      <p>The page you&rsquo;re looking for doesn&rsquo;t exist, or you may not have access to it.</p>
      <button type="button" className="btn btn-primary btn-lg" onClick={() => navigate("/")}>
        Go to your documents
      </button>
    </main>
  );
}
