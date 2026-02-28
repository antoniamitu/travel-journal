// frontend/src/App.jsx
import React from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";

import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import FeedPage from "./pages/FeedPage.jsx";
import ProtectedRoute from "./components/auth/ProtectedRoute.jsx";

function Placeholder({ title }) {
  return (
    <div
      style={{
        padding: 20,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
      }}
    >
      <h1 style={{ marginTop: 0 }}>{title}</h1>
      <p style={{ opacity: 0.85 }}>The page you’re looking for doesn’t exist.</p>
      <p style={{ marginTop: 12 }}>
        <Link to="/feed">Go to Feed</Link>
      </p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/feed" replace />} />

      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        path="/feed"
        element={
          <ProtectedRoute>
            <FeedPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Placeholder title="Not Found" />} />
    </Routes>
  );
}