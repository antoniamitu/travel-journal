// frontend/src/components/posts/ActionDialog.jsx
import React, { useEffect, useMemo, useRef } from "react";

function getFocusableElements(root) {
  if (!root) return [];

  return Array.from(
    root.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden"));
}

function DefaultIcon({ tone }) {
  if (tone === "neutral") {
    return "?";
  }

  return "!";
}

export default function ActionDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
  tone = "danger",
  onClose,
  onConfirm,
  titleId,
  descriptionId,
  icon,
  confirmBusyLabel = "Please wait..."
}) {
  const overlayRef = useRef(null);
  const cancelRef = useRef(null);
  const lastFocusedRef = useRef(null);

  const iconToneClass = useMemo(() => {
    if (tone === "neutral") return "bg-slate-100 text-slate-700";
    return "bg-rose-50 text-rose-600";
  }, [tone]);

  const confirmClass = useMemo(() => {
    if (tone === "neutral") {
      return "bg-slate-900 text-white hover:bg-slate-800";
    }
    return "bg-rose-600 text-white hover:bg-rose-700";
  }, [tone]);

  useEffect(() => {
    if (!open) return;

    lastFocusedRef.current = document.activeElement;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e) {
      if (!overlayRef.current) return;

      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onClose?.();
        return;
      }

      if (e.key === "Tab") {
        const focusables = getFocusableElements(overlayRef.current);
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => cancelRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);

      if (lastFocusedRef.current && typeof lastFocusedRef.current.focus === "function") {
        requestAnimationFrame(() => lastFocusedRef.current.focus());
      }
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) {
          onClose?.();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${iconToneClass}`}
            aria-hidden="true"
          >
            {icon ?? <DefaultIcon tone={tone} />}
          </div>

          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            <p id={descriptionId} className="mt-2 text-sm leading-6 text-slate-600">
              {message}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onClose?.()}
            disabled={busy}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={() => onConfirm?.()}
            disabled={busy}
            className={`inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${confirmClass}`}
          >
            {busy ? confirmBusyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}