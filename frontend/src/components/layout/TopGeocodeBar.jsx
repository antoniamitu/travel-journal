// frontend/src/components/layout/TopGeocodeBar.jsx
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "../../api/axios.js";
import { useDebouncedValue } from "../../hooks/useDebouncedValue.js";

function getDisplayLabel(item) {
  return item?.locationName || item?.displayName || "";
}

export default function TopGeocodeBar({ onSelectPlace }) {
  const inputId = useId();
  const listboxId = useId();

  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const abortRef = useRef(null);
  const suppressSearchForQueryRef = useRef("");
  const requestIdRef = useRef(0);

  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  // ✅ Debounce raw input to avoid timer juggling
  const debouncedQuery = useDebouncedValue(query, 500);

  const trimmed = query.trim();
  const debouncedTrimmed = debouncedQuery.trim();
  const canSearch = debouncedTrimmed.length >= 3;

  const showDropdown = useMemo(() => {
    if (!isOpen) return false;
    return isLoading || Boolean(error) || items.length > 0 || (hasSearched && items.length === 0);
  }, [isOpen, isLoading, error, items.length, hasSearched]);

  const activeOptionId = useMemo(() => {
    if (activeIndex < 0 || activeIndex >= items.length) return undefined;
    return `${listboxId}-opt-${activeIndex}`;
  }, [activeIndex, items.length, listboxId]);

  function closeDropdown() {
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function openDropdown() {
    setIsOpen(true);
  }

  function clearSearch() {
    // ✅ bulletproof: don't let a previous select block the next debounced search
    suppressSearchForQueryRef.current = "";
    requestIdRef.current += 1;

    // cancel in-flight request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;

    setQuery("");
    setItems([]);
    setError("");
    setHasSearched(false);
    setIsLoading(false);
    closeDropdown();

    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleSelect(item) {
    // Prevent immediate re-search for the programmatic query set
    const selectedLabel = getDisplayLabel(item);

    // Prevent only the programmatic query from triggering a new search.
    // Do not suppress a different query typed manually right after selection.
    suppressSearchForQueryRef.current = selectedLabel.trim();
    requestIdRef.current += 1;

    // cancel in-flight request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;

    setQuery(selectedLabel);
    setItems([]);
    setError("");
    setHasSearched(false);
    setIsLoading(false);
    closeDropdown();

    onSelectPlace?.(item);
  }

  useEffect(() => {
    const suppressedQuery = suppressSearchForQueryRef.current;
    if (suppressedQuery) {
      if (debouncedTrimmed === suppressedQuery) {
        suppressSearchForQueryRef.current = "";
        setItems([]);
        setError("");
        setHasSearched(false);
        setIsLoading(false);
        closeDropdown();
        return;
      }

      suppressSearchForQueryRef.current = "";
    }

    const requestId = (requestIdRef.current += 1);

    if (!canSearch) {
      setItems([]);
      setHasSearched(false);
      setError("");

      if (abortRef.current) abortRef.current.abort();
      abortRef.current = null;

      closeDropdown();
      setIsLoading(false);
      return;
    }

    openDropdown();

    if (abortRef.current) abortRef.current.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError("");
    setHasSearched(true);

    (async () => {
      try {
        const res = await api.post(
          "/geocode/search",
          { query: debouncedTrimmed },
          { timeout: 15000, signal: controller.signal }
        );

        if (requestId !== requestIdRef.current) {
          return;
        }

        const results = Array.isArray(res?.data?.results) ? res.data.results : [];
        setItems(results);
        setActiveIndex(results.length > 0 ? 0 : -1);
      } catch (err) {
        if (
          err?.name === "CanceledError" ||
          err?.code === "ERR_CANCELED" ||
          err?.name === "AbortError"
        ) {
          return;
        }

        if (requestId !== requestIdRef.current) {
          return;
        }

        const status = err?.response?.status;
        const message = err?.response?.data?.message;

        if (status === 429) setError(message || "Too many requests. Please slow down.");
        else if (status === 503) setError(message || "Geocoding service busy. Try again shortly.");
        else setError("Search failed. Please try again.");

        setItems([]);
        setActiveIndex(-1);
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }

        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    })();

    return () => {
      controller.abort();

      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    };
  }, [debouncedTrimmed, canSearch]);

  // Close on outside click + Escape (global)
  useEffect(() => {
    function onPointerDown(e) {
      if (!wrapRef.current?.contains(e.target)) closeDropdown();
    }
    function onKeyDown(e) {
      if (e.key === "Escape") closeDropdown();
    }
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function onInputKeyDown(e) {
    // open dropdown with arrows if user has >=3 chars typed (instant, not debounced)
    if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp") && trimmed.length >= 3) {
      e.preventDefault();
      openDropdown();
      return;
    }

    if (!showDropdown) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!items.length) return;
      setActiveIndex((prev) => (prev < 0 ? 0 : Math.min(prev + 1, items.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      setActiveIndex((prev) => (prev < 0 ? items.length - 1 : Math.max(prev - 1, 0)));
    } else if (e.key === "Home") {
      e.preventDefault();
      if (items.length) setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      if (items.length) setActiveIndex(items.length - 1);
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < items.length) {
        e.preventDefault();
        handleSelect(items[activeIndex]);
      }
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setError("");
            if (!isOpen && e.target.value.trim().length >= 3) openDropdown();
          }}
          onFocus={() => {
            if (query.trim().length >= 3) openDropdown();
          }}
          onKeyDown={onInputKeyDown}
          placeholder="Search places (e.g. Rome)…"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-activedescendant={activeOptionId}
          aria-busy={isLoading || undefined}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 pr-10 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
        />

        {/* Clear (X) — Variant A: clears only input UI */}
        {query.trim().length > 0 && (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-5 w-5"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 z-[1002] mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          {isLoading && <div className="px-4 py-3 text-sm text-slate-500">Searching…</div>}

          {error && <div className="px-4 py-3 text-sm text-red-600">{error}</div>}

          {!error && !isLoading && (
            <ul id={listboxId} role="listbox" aria-label="Places" className="m-0 list-none p-0">
              {items.map((item, idx) => {
                const isActive = idx === activeIndex;
                const optionId = `${listboxId}-opt-${idx}`;
                return (
                  <li key={`${item.lat}-${item.lng}-${item.displayName || idx}`} role="presentation">
                    <button
                      id={optionId}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => handleSelect(item)}
                      className={[
                        "block w-full px-4 py-3 text-left text-sm transition",
                        isActive ? "bg-slate-100" : "hover:bg-slate-100"
                      ].join(" ")}
                    >
                      <div className="font-medium text-slate-900">{getDisplayLabel(item)}</div>
                      {(item.city || item.country) && (
                        <div className="text-xs text-slate-500">
                          {[item.city, item.country].filter(Boolean).join(", ")}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}

              {hasSearched && items.length === 0 && (
                <li className="px-4 py-3 text-sm text-slate-500">
                  No locations found for &quot;{debouncedTrimmed}&quot;
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}