import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./globals.css";

// Scroll-reveal is opt-in. Hiding every section before it intersects can leave
// blank screens during fast mobile scrolling.
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

  const observe = () => {
    document.querySelectorAll(".reveal").forEach((el) => {
      if (!el.classList.contains("visible")) {
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
