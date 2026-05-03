// frontend/src/components/layout/Sidebar.jsx
import React from "react";
import { NavLink } from "react-router-dom";

function MapIcon({ className = "h-6 w-6" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9.4" />
      <path d="M15.2 8.8l-2.3 5.1-5.1 2.3 2.3-5.1 5.1-2.3Z" />
    </svg>
  );
}

function FeedIcon({ className = "h-6 w-6" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9.4" />
      <path d="M3.8 12h16.4" />
      <path d="M12 3.3c2.7 2.45 4.25 5.75 4.25 8.7S14.7 18.25 12 20.7C9.3 18.25 7.75 14.95 7.75 12S9.3 5.75 12 3.3Z" />
    </svg>
  );
}

function DashboardIcon({ className = "h-6 w-6" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 19V5" />
      <path d="M4 19h16" />

      <path
        d="M8 16v-5"
        className="transition-transform duration-500 ease-out group-hover:-translate-y-1 group-focus-visible:-translate-y-1 group-active:translate-y-0.5"
      />
      <path
        d="M12 16V8"
        className="transition-transform duration-500 ease-out group-hover:translate-y-1 group-focus-visible:translate-y-1 group-active:-translate-y-0.5"
      />
      <path
        d="M16 16v-7"
        className="transition-transform duration-500 ease-out group-hover:-translate-y-1.5 group-focus-visible:-translate-y-1.5 group-active:translate-y-0.5"
      />
      <path
        d="M20 16v-3"
        className="transition-transform duration-500 ease-out group-hover:translate-y-1 group-focus-visible:translate-y-1 group-active:-translate-y-0.5"
      />
    </svg>
  );
}

function ProfileIcon({ className = "h-6 w-6" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="3.75" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

const NAV_ITEMS = [
  {
    to: "/map",
    label: "Map",
    subtitle: "Explore locations",
    Icon: MapIcon,
    rotateOnInteract: true
  },
  {
    to: "/feed",
    label: "Feed",
    subtitle: "Discover Stories",
    Icon: FeedIcon,
    rotateOnInteract: false
  },
  {
    to: "/dashboard",
    label: "Dashboard",
    subtitle: "Travel insights",
    Icon: DashboardIcon,
    rotateOnInteract: false
  },
  {
    to: "/profile",
    label: "Profile",
    subtitle: "Your account",
    Icon: ProfileIcon,
    rotateOnInteract: false
  }
];

function DesktopNavItem({ to, label, subtitle, Icon, rotateOnInteract = false }) {
  return (
    <NavLink to={to} className="group block focus:outline-none">
      {({ isActive }) => (
        <div
          className={[
            "flex min-h-[96px] items-center gap-4 rounded-full border px-5 py-3 transition-all duration-300",
            isActive
              ? "border-slate-300 bg-[#eff7f6] text-cyan-700 shadow-[0_18px_42px_rgba(15,118,110,0.18)] group-focus-visible:ring-4 group-focus-visible:ring-cyan-200/60"
              : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-white/80 hover:text-slate-900 hover:shadow-[0_18px_38px_rgba(8,145,178,0.16),0_0_30px_rgba(16,185,129,0.10)] group-focus-visible:border-slate-200 group-focus-visible:bg-white/85 group-focus-visible:shadow-[0_22px_52px_rgba(15,118,110,0.28),0_0_42px_rgba(16,185,129,0.18)] group-focus-visible:ring-4 group-focus-visible:ring-cyan-200/55"
          ].join(" ")}
        >
          <span
            className={[
              "inline-flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[22px] transition-all duration-300",
              isActive
                ? "bg-cyan-50 text-cyan-700 shadow-[0_18px_38px_rgba(8,145,178,0.22),0_0_30px_rgba(16,185,129,0.14)] ring-1 ring-cyan-100"
                : "bg-slate-50 text-slate-600 shadow-[0_14px_28px_rgba(15,23,42,0.10)] ring-1 ring-slate-100 group-hover:bg-cyan-50 group-hover:text-cyan-700 group-hover:shadow-[0_18px_38px_rgba(8,145,178,0.20),0_0_30px_rgba(16,185,129,0.14)] group-focus-visible:bg-cyan-50 group-focus-visible:text-cyan-700 group-focus-visible:shadow-[0_18px_38px_rgba(8,145,178,0.24),0_0_34px_rgba(16,185,129,0.18)]"
            ].join(" ")}
          >
            <Icon
              className={[
                "h-7 w-7 transition-transform duration-500",
                rotateOnInteract
                  ? "group-hover:rotate-180 group-focus-visible:rotate-180 group-active:rotate-180"
                  : ""
              ].join(" ")}
            />
          </span>

          <span className="min-w-0">
            <span
              className={[
                "block text-[22px] font-extrabold tracking-tight",
                isActive
                  ? "text-cyan-800"
                  : "text-slate-600 group-hover:text-slate-800 group-focus-visible:text-slate-800"
              ].join(" ")}
            >
              {label}
            </span>

            <span
              className={[
                "mt-0.5 block text-sm font-semibold",
                isActive
                  ? "text-cyan-700"
                  : "text-slate-400 group-hover:text-slate-500 group-focus-visible:text-slate-500"
              ].join(" ")}
            >
              {subtitle}
            </span>
          </span>
        </div>
      )}
    </NavLink>
  );
}

function MobileNavItem({ to, label, Icon, rotateOnInteract = false }) {
  return (
    <NavLink to={to} className="group flex-1 focus:outline-none">
      {({ isActive }) => (
        <div
          className={[
            "flex min-h-[66px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-[11px] font-semibold transition-all duration-300",
            isActive
              ? "border-slate-300 bg-[#eff7f6] text-cyan-700 shadow-[0_12px_28px_rgba(15,118,110,0.18)] group-focus-visible:ring-4 group-focus-visible:ring-cyan-200/60"
              : "border-transparent text-slate-500 hover:border-slate-200 hover:bg-white/85 hover:text-slate-700 hover:shadow-[0_14px_30px_rgba(8,145,178,0.14),0_0_24px_rgba(16,185,129,0.10)] group-focus-visible:border-slate-200 group-focus-visible:bg-white/90 group-focus-visible:shadow-[0_18px_38px_rgba(15,118,110,0.24),0_0_30px_rgba(16,185,129,0.16)] group-focus-visible:ring-4 group-focus-visible:ring-cyan-200/55"
          ].join(" ")}
        >
          <span
            className={[
              "inline-flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-300",
              isActive
                ? "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100"
                : "bg-slate-50 text-slate-600 group-hover:bg-cyan-50 group-hover:text-cyan-700 group-focus-visible:bg-cyan-50 group-focus-visible:text-cyan-700"
            ].join(" ")}
          >
            <Icon
              className={[
                "h-5 w-5 transition-transform duration-500",
                rotateOnInteract
                  ? "group-hover:rotate-180 group-focus-visible:rotate-180 group-active:rotate-180"
                  : ""
              ].join(" ")}
            />
          </span>

          <span className={["truncate", isActive ? "text-cyan-800" : ""].join(" ")}>
            {label}
          </span>
        </div>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <>
      <aside className="relative z-10 hidden w-[300px] shrink-0 border-r border-cyan-100/80 bg-white shadow-[18px_0_58px_rgba(8,145,178,0.22),0_0_54px_rgba(16,185,129,0.18),inset_-1px_0_0_rgba(45,212,191,0.16)] md:block xl:w-[340px]">
        <div className="sticky top-[108px] px-6 py-8 lg:top-[116px] lg:px-8">
          <div className="flex items-center gap-4">
            <div className="h-0.5 flex-1 rounded-full bg-gradient-to-r from-transparent via-cyan-400 to-teal-500" />
            <div className="text-[13px] font-extrabold uppercase tracking-[0.24em] text-slate-400">
              Menu
            </div>
          </div>

          <nav className="mt-12 space-y-5">
            {NAV_ITEMS.map((item) => (
              <DesktopNavItem key={item.to} {...item} />
            ))}
          </nav>
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