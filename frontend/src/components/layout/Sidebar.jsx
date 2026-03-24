// frontend/src/components/layout/Sidebar.jsx
import React from "react";
import { NavLink } from "react-router-dom";

function MapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l-6 3V6l6-3m0 15l6 3m-6-3V3m6 18l6-3V3l-6 3m0 15V6" />
    </svg>
  );
}

function FeedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="2">
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="2">
      <path d="M20 21a8 8 0 10-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function NavItem({ to, label, icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-300",
          isActive
            ? "bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow-[0_10px_24px_rgba(6,182,212,0.28)]"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        ].join(" ")
      }
    >
      <span aria-hidden="true" className="shrink-0">
        {icon}
      </span>
      <span>{label}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <aside className="relative z-10 hidden w-[320px] shrink-0 xl:block">
      <div className="sticky top-[112px] px-6 py-6">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
          <div className="text-[13px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Navigation
          </div>

          <div className="mt-4 text-[15px] leading-8 text-slate-500">
            Move between your travel spaces.
          </div>

          <nav className="mt-8 space-y-3">
            <NavItem to="/map" label="Map" icon={<MapIcon />} />
            <NavItem to="/feed" label="Feed" icon={<FeedIcon />} />
            <NavItem to="/profile" label="Profile" icon={<ProfileIcon />} />
          </nav>
        </div>
      </div>
    </aside>
  );
}