import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

const attachRuntimeErrorOverlay = () => {
  if (typeof window === "undefined") return;

  const render = (title, payload) => {
    try {
      const existing = document.getElementById("runtime-error-overlay");
      if (existing) existing.remove();

      const el = document.createElement("div");
      el.id = "runtime-error-overlay";
      el.style.position = "fixed";
      el.style.top = "0";
      el.style.left = "0";
      el.style.right = "0";
      el.style.bottom = "0";
      el.style.zIndex = "2147483647";
      el.style.background = "rgba(0,0,0,0.92)";
      el.style.color = "#fff";
      el.style.padding = "16px";
      el.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace";
      el.style.fontSize = "12px";
      el.style.whiteSpace = "pre-wrap";
      el.style.overflow = "auto";

      const text =
        typeof payload === "string"
          ? payload
          : payload instanceof Error
            ? `${payload.name}: ${payload.message}\n\n${payload.stack || ""}`
            : JSON.stringify(payload, null, 2);

      el.textContent = `${title}\n\n${text}`;
      document.body.appendChild(el);
    } catch {}
  };

  window.addEventListener("error", (e) => {
    render("window.error", e?.error || e?.message || String(e));
  });

  window.addEventListener("unhandledrejection", (e) => {
    render("unhandledrejection", e?.reason || String(e));
  });
};

attachRuntimeErrorOverlay();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
