// frontend/src/components/layout/Sidebar.jsx
import React from "react";
import { NavLink } from "react-router-dom";

function NavItem({ to, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "block rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-300",
          isActive
            ? "border border-emerald-300 bg-emerald-600/10 text-emerald-800 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),inset_0_-1px_1px_rgba(0,0,0,0.05)]"
            : "text-slate-700 hover:bg-slate-200 hover:text-slate-950"
        ].join(" ")
      }
    >
      {label}
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <aside className="relative z-10 hidden w-64 shrink-0 border-r border-slate-300 bg-slate-100 shadow-[2px_0_12px_rgba(0,0,0,0.03)] lg:block">
      <div className="sticky top-[72px] h-[calc(100vh-72px)] overflow-y-auto">
        <nav className="flex h-full flex-col justify-center gap-2 px-4 py-6">
          <NavItem to="/feed" label="Feed" />
          <NavItem to="/map" label="Map" />
        </nav>
      </div>
    </aside>
  );
}