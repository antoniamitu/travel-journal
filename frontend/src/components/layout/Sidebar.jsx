// frontend/src/components/layout/Sidebar.jsx
import React from "react";
import { NavLink } from "react-router-dom";

function NavItem({ to, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-300 ring-emerald-500/30 ${
          isActive
            ? "bg-emerald-600/10 text-emerald-800 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),inset_0_-1px_1px_rgba(0,0,0,0.05)] border border-emerald-300" // Link activ cu adâncime și culoare subtilă
            : "text-slate-700 hover:bg-slate-200 hover:text-slate-950" // Efect curat la hover
        }`
      }
    >
      {label}
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <aside className="hidden w-64 border-r border-slate-300 bg-slate-100 shadow-[2px_0_12px_rgba(0,0,0,0.03)] lg:flex lg:flex-col shrink-0">
      <nav className="flex-1 space-y-2 px-4 pt-6">
        <NavItem to="/feed" label="Feed" />
        <NavItem to="/map" label="Map" />
      </nav>
    </aside>
  );
}