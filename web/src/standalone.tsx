import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { StandaloneApp } from "@/pages/standalone-app";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="dark" storageKey="agentcast:theme" disableTransitionOnChange>
      <StandaloneApp />
    </ThemeProvider>
  </StrictMode>,
);
