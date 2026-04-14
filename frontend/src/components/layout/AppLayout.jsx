// frontend/src/components/layout/AppLayout.jsx
import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import NavBar from "./NavBar.jsx";
import Sidebar from "./Sidebar.jsx";

function isEditorWorkspace(pathname) {
  return pathname === "/posts/new" || /^\/posts\/[^/]+\/edit$/.test(pathname || "");
}

export default function AppLayout() {
  const location = useLocation();
  const hideSidebar = isEditorWorkspace(location.pathname);

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-slate-100">
      <NavBar />

      <div className="flex min-h-0 flex-1">
        {!hideSidebar && <Sidebar />}
        <main
          className={[
            "relative z-0 min-w-0 flex-1",
            hideSidebar ? "" : "pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0"
          ].join(" ")}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
