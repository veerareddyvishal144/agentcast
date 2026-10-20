import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { LandingApp } from "@/pages/landing-app";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="dark" storageKey="agentcast:theme" disableTransitionOnChange>
      <LandingApp />
    </ThemeProvider>
  </StrictMode>,
);
