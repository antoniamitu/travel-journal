// frontend/src/components/ui/FullscreenLoader.jsx
import React from "react";

export default function FullscreenLoader({
  title = "Checking session…",
  subtitle = "Please wait a moment.",
  width = 420
}) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div
        style={{
          width,
          maxWidth: "92vw",
          background: "#111827",
          padding: 20,
          borderRadius: 12,
          border: "1px solid #334155"
        }}
      >
        <div style={{ fontWeight: 800, color: "white" }}>{title}</div>
        <div style={{ marginTop: 8, opacity: 0.85, color: "#cbd5e1" }}>{subtitle}</div>
      </div>
    </div>
  );
}