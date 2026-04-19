import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./globals.css";

// Scroll-reveal: observe all section elements and .reveal elements
function initReveal() {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
  );

  // Observe existing elements
  const observe = () => {
    document.querySelectorAll("section, .reveal").forEach((el) => {
      if (!el.classList.contains("visible")) {
        el.classList.add("reveal");
        io.observe(el);
      }
    });
  };

  observe();

  // Re-observe after React renders new content
  const mo = new MutationObserver(observe);
  mo.observe(document.body, { childList: true, subtree: true });
}

// Run after first paint
requestAnimationFrame(() => setTimeout(initReveal, 100));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
