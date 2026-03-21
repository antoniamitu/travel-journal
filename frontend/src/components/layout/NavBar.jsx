// frontend/src/components/layout/NavBar.jsx
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";

function isPostsWorkspace(pathname) {
  return pathname === "/posts/new" || /^\/posts\/[^/]+(?:\/edit)?$/.test(pathname || "");
}

export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hoverIndex, setHoverIndex] = useState(-1);
  const [globalSearch, setGlobalSearch] = useState("");

  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const itemsRef = useRef([]);

  const menuId = useId();
  const postsWorkspace = isPostsWorkspace(location.pathname);

  const displayName = useMemo(
    () => user?.username || user?.email || "Account",
    [user?.username, user?.email]
  );
  const emailLabel = useMemo(() => user?.email || "—", [user?.email]);

  const closeMenu = useCallback(({ restoreFocus = true } = {}) => {
    setOpen(false);
    setActiveIndex(-1);
    setHoverIndex(-1);
    if (restoreFocus) requestAnimationFrame(() => buttonRef.current?.focus());
  }, []);

  const openMenu = useCallback(() => setOpen(true), []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e) {
      if (!wrapRef.current?.contains(e.target)) closeMenu({ restoreFocus: false });
    }

    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
      }
    }

    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closeMenu]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      const first = itemsRef.current?.[0];
      if (first) {
        first.focus();
        setActiveIndex(0);
      }
    });
  }, [open]);

  const onWrapperBlur = useCallback(
    (e) => {
      if (!open) return;
      if (e.relatedTarget && wrapRef.current?.contains(e.relatedTarget)) return;
      closeMenu({ restoreFocus: false });
    },
    [open, closeMenu]
  );

  const onTriggerKeyDown = useCallback(
    (e) => {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (!open) openMenu();
        else requestAnimationFrame(() => itemsRef.current?.[0]?.focus());
      }
    },
    [open, openMenu]
  );

  const handleLogout = useCallback(async () => {
    try {
      const maybePromise = logout?.();
      if (maybePromise && typeof maybePromise.then === "function") await maybePromise;
      toast.success("Logged out.");
    } finally {
      closeMenu({ restoreFocus: false });
      navigate("/login", { replace: true });
    }
  }, [logout, closeMenu, navigate]);

  const MENU_ITEMS = useMemo(
    () => [{ key: "logout", label: "Logout", onSelect: handleLogout }],
    [handleLogout]
  );

  const onMenuKeyDown = useCallback(
    (e) => {
      const count = MENU_ITEMS.length;
      if (!count) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min((activeIndex < 0 ? 0 : activeIndex + 1), count - 1);
        setActiveIndex(next);
        requestAnimationFrame(() => itemsRef.current?.[next]?.focus());
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = Math.max((activeIndex < 0 ? 0 : activeIndex - 1), 0);
        setActiveIndex(next);
        requestAnimationFrame(() => itemsRef.current?.[next]?.focus());
      } else if (e.key === "Home") {
        e.preventDefault();
        setActiveIndex(0);
        requestAnimationFrame(() => itemsRef.current?.[0]?.focus());
      } else if (e.key === "End") {
        e.preventDefault();
        const last = count - 1;
        setActiveIndex(last);
        requestAnimationFrame(() => itemsRef.current?.[last]?.focus());
      }
    },
    [activeIndex, MENU_ITEMS]
  );

  const shellClass = postsWorkspace
    ? "border-slate-200 bg-white"
    : "border-white/10 bg-[oklch(39.8%_0.07_227.392)]";

  const brandTextClass = postsWorkspace
    ? "text-slate-900 hover:text-emerald-700"
    : "text-white hover:text-emerald-200";

  return (
    <nav className={`sticky top-0 z-[1100] border-b ${shellClass}`}>
      <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-4 px-4">
        <Link
          to="/feed"
          className={`flex shrink-0 items-center gap-3 text-lg font-bold transition ${brandTextClass}`}
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm">
            📍
          </span>
          <span>GeoTravel Journal</span>
        </Link>

        <form
          className="max-w-xl flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!globalSearch.trim()) return;
            toast("Global search will be connected later.");
          }}
        >
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              🔎
            </span>

            <input
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Search people, posts, places..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-11 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </div>
        </form>

        <Link
          to="/posts/new"
          className="shrink-0 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          + New Post
        </Link>

        <div
          ref={wrapRef}
          className="relative shrink-0 outline-none"
          tabIndex={-1}
          onBlur={onWrapperBlur}
        >
          <button
            ref={buttonRef}
            type="button"
            onClick={() => (open ? closeMenu() : openMenu())}
            onKeyDown={onTriggerKeyDown}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={menuId}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            <span className="max-w-[180px] truncate">{displayName}</span>
            <span className="text-xs opacity-70">{open ? "▲" : "▼"}</span>
          </button>

          {open && (
            <div
              id={menuId}
              role="menu"
              aria-label="Account menu"
              onKeyDown={onMenuKeyDown}
              className="absolute right-0 top-full z-[1101] mt-2 min-w-[220px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
            >
              <div className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
                Signed in as
                <div className="mt-1 break-words text-sm font-semibold text-slate-900">
                  {emailLabel}
                </div>
              </div>

              <ul className="m-0 list-none p-0">
                {MENU_ITEMS.map((it, idx) => (
                  <li key={it.key}>
                    <button
                      type="button"
                      role="menuitem"
                      ref={(el) => {
                        itemsRef.current[idx] = el;
                      }}
                      onFocus={() => setActiveIndex(idx)}
                      onMouseEnter={() => setHoverIndex(idx)}
                      onMouseLeave={() => setHoverIndex(-1)}
                      onClick={it.onSelect}
                      className={[
                        "w-full px-4 py-3 text-left text-sm transition",
                        activeIndex === idx || hoverIndex === idx
                          ? "bg-slate-50 text-slate-900"
                          : "text-slate-700 hover:bg-slate-50"
                      ].join(" ")}
                    >
                      {it.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}