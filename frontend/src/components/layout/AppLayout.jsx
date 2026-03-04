// frontend/src/components/layout/AppLayout.jsx
import React from "react";
import { Outlet } from "react-router-dom";
import NavBar from "./NavBar.jsx";
import Sidebar from "./Sidebar.jsx";

export default function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-[oklch(45%_0.085_224.283)]">
      <NavBar />

      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}