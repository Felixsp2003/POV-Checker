import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";

// Unbehandelte Promise-Fehler dürfen die Seite nicht lahmlegen — nur protokollieren.
window.addEventListener("unhandledrejection", (ev) => {
  try { console.error("[DC Checker] Unbehandelter Fehler:", ev.reason); } catch { /* noop */ }
  ev.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
