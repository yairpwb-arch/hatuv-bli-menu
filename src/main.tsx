import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Prevent text selection everywhere except in form inputs
document.addEventListener('selectstart', (e) => {
  const target = e.target as Element;
  if (!target.closest('input, textarea, select, [contenteditable]')) {
    e.preventDefault();
  }
});

// Prevent context menu (long-press callout) on non-input elements
document.addEventListener('contextmenu', (e) => {
  const target = e.target as Element;
  if (!target.closest('input, textarea, select, [contenteditable]')) {
    e.preventDefault();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
