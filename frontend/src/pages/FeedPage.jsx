// frontend/src/pages/FeedPage.jsx
import React from "react";
import NavBar from "../components/NavBar.jsx";
import { useAuth } from "../hooks/useAuth.js";

export default function FeedPage() {
  const { user } = useAuth();

  return (
    <div style={{ minHeight: "100vh" }}>
      <NavBar />

      <main style={{ maxWidth: 1000, margin: "0 auto", padding: 16 }}>
        <h1 style={{ marginTop: 0 }}>Feed</h1>
        <p style={{ opacity: 0.85, marginTop: 6 }}>
          Placeholder. Here we will render public posts later.
        </p>

        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 12,
            border: "1px solid #1f2937",
            background: "#0f172a"
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.8 }}>Debug</div>
          <div
            style={{
              marginTop: 6,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 13
            }}
          >
            user.id: {user?.id ?? "—"} <br />
            user.username: {user?.username ?? "—"} <br />
            user.email: {user?.email ?? "—"}
          </div>
        </div>
      </main>
    </div>
  );
}