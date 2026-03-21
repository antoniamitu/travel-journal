// frontend/src/components/layout/AppLayout.jsx
import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import NavBar from "./NavBar.jsx";
import Sidebar from "./Sidebar.jsx";

function isPostsWorkspace(pathname) {
  return pathname === "/posts/new" || /^\/posts\/[^/]+(?:\/edit)?$/.test(pathname || "");
}

export default function AppLayout() {
  const location = useLocation();
  const postsWorkspace = isPostsWorkspace(location.pathname);

  return (
    <div
      className={[
        "flex min-h-screen flex-col overflow-x-hidden",
        postsWorkspace ? "bg-slate-100" : "bg-[oklch(45%_0.085_224.283)]"
      ].join(" ")}
    >
      <NavBar />

      <div className="flex min-h-0 flex-1">
        {!postsWorkspace && <Sidebar />}
        <main className="relative z-0 min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}