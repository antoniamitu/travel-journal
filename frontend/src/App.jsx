// frontend/src/App.jsx
import React from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";


import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import FeedPage from "./pages/FeedPage.jsx";
import MapPage from "./pages/MapPage.jsx";
import ProtectedRoute from "./components/auth/ProtectedRoute.jsx";
import AppLayout from "./components/layout/AppLayout.jsx";

function Placeholder({ title }) {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-slate-600">The page you're looking for doesn't exist.</p>
        <p className="mt-4">
          <Link className="font-semibold text-emerald-600 hover:text-emerald-700" to="/feed">
            Go to Feed
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/feed" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/map" element={<MapPage />} />
        </Route>

        <Route path="*" element={<Placeholder title="Not Found" />} />
      </Routes>
    </>
  );
}