import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";

// Der ErrorBoundary sorgt dafür, dass ein Absturz sichtbar angezeigt wird,
// statt eine schwarze Seite zu hinterlassen. Die Daten bleiben erhalten.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
