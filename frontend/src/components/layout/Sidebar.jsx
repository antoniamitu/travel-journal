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

const NAV_ITEMS = [
  { to: "/map", label: "Map", icon: <MapIcon /> },
  { to: "/feed", label: "Feed", icon: <FeedIcon /> },
  { to: "/profile", label: "Profile", icon: <ProfileIcon /> }
];

function DesktopNavItem({ to, label, icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "flex min-h-11 items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-300",
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

function MobileNavItem({ to, label, icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-semibold transition",
          isActive
            ? "bg-cyan-50 text-cyan-700 shadow-[0_8px_24px_rgba(6,182,212,0.16)]"
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
        ].join(" ")
      }
    >
      <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <>
      <aside className="relative z-10 hidden w-[280px] shrink-0 md:block xl:w-[320px]">
        <div className="sticky top-[104px] px-4 py-6 lg:px-6">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.08)] lg:p-6">
            <div className="text-[13px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Navigation
            </div>

            <div className="mt-4 text-sm leading-7 text-slate-500 lg:text-[15px]">
              Move between your travel spaces.
            </div>

            <nav className="mt-8 space-y-3">
              {NAV_ITEMS.map((item) => (
                <DesktopNavItem key={item.to} {...item} />
              ))}
            </nav>
          </div>
        </div>
      </aside>

      <nav
        className="fixed inset-x-0 bottom-0 z-[1050] border-t border-slate-200 bg-white/95 px-3 py-2 shadow-[0_-12px_30px_rgba(15,23,42,0.10)] backdrop-blur md:hidden"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
        aria-label="Bottom navigation"
      >
        <div className="mx-auto flex max-w-md items-stretch gap-2">
          {NAV_ITEMS.map((item) => (
            <MobileNavItem key={item.to} {...item} />
          ))}
        </div>
      </nav>
    </>
  );
}
