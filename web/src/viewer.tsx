import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { ViewerApp } from "@/pages/viewer-app";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="dark" storageKey="agentcast:theme" disableTransitionOnChange>
      <ViewerApp />
    </ThemeProvider>
  </StrictMode>,
);
