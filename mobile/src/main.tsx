import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { openDatabase } from "@/db/database";
import { applyTheme, getStoredTheme } from "@/lib/theme";

// Debe correr antes del primer paint para evitar flash del tema equivocado.
applyTheme(getStoredTheme());

openDatabase().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
