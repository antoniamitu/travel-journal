// frontend/src/components/NavBar.jsx
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";

/**
 * NavBar
 * - dropdown robust: click-outside, Escape, close on blur
 * - accessibility: aria-controls, aria-expanded, keyboard support (Enter/Space, ArrowDown/Up)
 * - focus management: focus first item on open, restore focus to button on close
 * - logout safe: awaits logout if it returns a promise, then navigates to /login (replace)
 */
export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hoverIndex, setHoverIndex] = useState(-1);

  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const itemsRef = useRef([]);

  const menuId = useId();

  const displayName = useMemo(() => user?.username || user?.email || "Account", [user?.username, user?.email]);
  const emailLabel = useMemo(() => user?.email || "—", [user?.email]);

  const closeMenu = useCallback(({ restoreFocus = true } = {}) => {
    setOpen(false);
    setActiveIndex(-1);
    setHoverIndex(-1);

    if (restoreFocus) {
      requestAnimationFrame(() => buttonRef.current?.focus());
    }
  }, []);

  const openMenu = useCallback(() => {
    setOpen(true);
  }, []);

  // Global listeners only when open (click-outside, Escape)
  useEffect(() => {
    if (!open) return;

    function onPointerDown(e) {
      const root = wrapRef.current;
      if (!root) return;
      if (!root.contains(e.target)) closeMenu({ restoreFocus: false });
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

  // Focus first item on open
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

  // Close on blur (when focus leaves the whole wrapper)
  const onWrapperBlur = useCallback(
    (e) => {
      if (!open) return;

      const root = wrapRef.current;
      if (!root) return;

      const nextFocused = e.relatedTarget;
      if (nextFocused && root.contains(nextFocused)) return;

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

  const onMenuKeyDown = useCallback(
    (e) => {
      const count = MENU_ITEMS.length;
      if (!count) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min((activeIndex < 0 ? 0 : activeIndex + 1), count - 1);
        setActiveIndex(next);
        requestAnimationFrame(() => itemsRef.current?.[next]?.focus());
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = Math.max((activeIndex < 0 ? 0 : activeIndex - 1), 0);
        setActiveIndex(next);
        requestAnimationFrame(() => itemsRef.current?.[next]?.focus());
        return;
      }

      if (e.key === "Home") {
        e.preventDefault();
        setActiveIndex(0);
        requestAnimationFrame(() => itemsRef.current?.[0]?.focus());
        return;
      }

      if (e.key === "End") {
        e.preventDefault();
        const last = count - 1;
        setActiveIndex(last);
        requestAnimationFrame(() => itemsRef.current?.[last]?.focus());
        return;
      }

      // Tab is allowed; blur handler will close when focus leaves the wrapper.
    },
    [activeIndex]
  );

  const handleLogout = useCallback(async () => {
    try {
      const maybePromise = logout?.();
      if (maybePromise && typeof maybePromise.then === "function") {
        await maybePromise;
      }
    } finally {
      closeMenu({ restoreFocus: false });
      navigate("/login", { replace: true });
    }
  }, [logout, closeMenu, navigate]);

  const MENU_ITEMS = useMemo(
    () => [
      {
        key: "logout",
        label: "Logout",
        onSelect: handleLogout
      }
    ],
    [handleLogout]
  );

  const styles = {
    nav: { position: "sticky", top: 0, zIndex: 10, background: "#111827", borderBottom: "1px solid #334155" },
    container: {
      maxWidth: 1000,
      margin: "0 auto",
      padding: "12px 16px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12
    },
    brand: { color: "white", textDecoration: "none", fontWeight: 800, fontSize: "1.1rem" },
    wrap: { position: "relative", outline: "none" },
    trigger: {
      background: "transparent",
      border: "1px solid #334155",
      color: "white",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 10px",
      borderRadius: 12
    },
    name: { maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    caret: { fontSize: "0.8rem", opacity: 0.85 },
    menu: {
      position: "absolute",
      right: 0,
      top: "100%",
      marginTop: 10,
      background: "#1f2937",
      border: "1px solid #334155",
      borderRadius: 12,
      minWidth: 240,
      overflow: "hidden",
      boxShadow: "0 10px 30px rgba(0,0,0,0.35)"
    },
    meta: { padding: 12, borderBottom: "1px solid #334155", color: "#cbd5e1", fontSize: 13 },
    email: { marginTop: 6, color: "white", fontWeight: 700, wordBreak: "break-word" },
    list: { listStyle: "none", margin: 0, padding: 0 },
    itemBtn: (isActive, isHover) => ({
      width: "100%",
      textAlign: "left",
      padding: 12,
      background: isActive || isHover ? "#0f172a" : "transparent",
      color: "white",
      border: "none",
      cursor: "pointer"
    })
  };

  return (
    <nav style={styles.nav}>
      <div style={styles.container}>
        <Link to="/feed" style={styles.brand}>
          🌍 Travel Journal
        </Link>

        <div ref={wrapRef} style={styles.wrap} tabIndex={-1} onBlur={onWrapperBlur}>
          <button
            ref={buttonRef}
            type="button"
            onClick={() => (open ? closeMenu() : openMenu())}
            onKeyDown={onTriggerKeyDown}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={menuId}
            style={styles.trigger}
          >
            <span style={styles.name}>{displayName}</span>
            <span style={styles.caret}>{open ? "▲" : "▼"}</span>
          </button>

          {open && (
            <div id={menuId} role="menu" aria-label="Account menu" style={styles.menu} onKeyDown={onMenuKeyDown}>
              <div style={styles.meta}>
                Signed in as
                <div style={styles.email}>{emailLabel}</div>
              </div>

              <ul style={styles.list}>
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
                      style={styles.itemBtn(activeIndex === idx, hoverIndex === idx)}
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