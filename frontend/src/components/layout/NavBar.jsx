// frontend/src/components/layout/NavBar.jsx
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../../api/axios.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useLocationContext } from "../../hooks/useLocationContext.js";

const SEARCH_DEBOUNCE_MS = 500;
const SEARCH_PREFLIGHT_TIMEOUT_MS = 4000;
const SEARCH_GEOCODE_TIMEOUT_MS = 5000;
const MIN_SUGGEST_CHARS = 3;
const MAX_SUGGESTIONS = 5;
const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC_RE = /[^a-z0-9]+/g;

function getAvatarInitials(user) {
  const source = String(user?.username || user?.email || "A").trim();
  if (!source) return "A";

  const parts = source.replace(/[@._-]+/g, " ").split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

function normalizeLooseSearchKey(value) {
  if (typeof value !== "string") return "";

  return value
    .trim()
    .normalize("NFKD")
    .replace(COMBINING_MARKS_RE, "")
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_RE, "");
}

function hasMinimumSearchChars(value) {
  return normalizeLooseSearchKey(value).length >= MIN_SUGGEST_CHARS;
}

function getFeedSearchFromLocation(location) {
  if (location.pathname !== "/feed") {
    return "";
  }

  const params = new URLSearchParams(location.search);
  return String(params.get("q") || "").trim();
}

function getCurrentFeedSentiment(location) {
  const params = new URLSearchParams(location.search);
  const sentiment = String(params.get("sentiment") || "").trim().toLowerCase();
  return ["positive", "neutral", "negative"].includes(sentiment) ? sentiment : "";
}

function buildFeedSearchUrl(query, currentLocation) {
  const params = new URLSearchParams();

  const trimmedQuery = String(query || "").trim();
  const currentSentiment = getCurrentFeedSentiment(currentLocation);

  if (trimmedQuery) {
    params.set("q", trimmedQuery);
  }

  if (currentSentiment) {
    params.set("sentiment", currentSentiment);
  }

  const search = params.toString();
  return {
    pathname: "/feed",
    search: search ? `?${search}` : ""
  };
}

function getSearchTextFromSuggestion(item) {
  return String(item?.label || item?.queryValue || "").trim();
}

function pickFirstValidGeocodeResult(results) {
  if (!Array.isArray(results)) return null;

  return (
    results.find((item) => Number.isFinite(Number(item?.lat)) && Number.isFinite(Number(item?.lng))) ||
    null
  );
}

function SearchDropdown({
  open,
  listboxId,
  isLoading,
  isSubmitPending,
  query,
  suggestions,
  activeIndex,
  onHighlight,
  onSelectSuggestion,
  onSearchAll
}) {
  if (!open) return null;

  const searchAllIndex = suggestions.length;
  const showEmptyState = !isLoading && suggestions.length === 0;

  return (
    <div className="absolute left-0 right-0 top-full z-[1200] mt-3 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
      <div id={listboxId} role="listbox" aria-label="Place suggestions">
        {suggestions.length > 0 ? (
          <div className="border-b border-slate-100 px-4 pt-3 pb-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">
              🖼️ Post places
            </div>
          </div>
        ) : null}

        {suggestions.length > 0 ? (
          <div className="py-1.5">
            {suggestions.map((item, index) => (
              <button
                key={`${item.kind}-${item.queryValue}-${item.city || ""}-${item.country || ""}-${item.label}`}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                onMouseEnter={() => onHighlight(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSelectSuggestion(item)}
                className={[
                  "flex w-full items-start gap-3 px-4 py-3 text-left transition",
                  activeIndex === index ? "bg-slate-50" : "hover:bg-slate-50"
                ].join(" ")}
              >
                <span className="mt-0.5 text-base" aria-hidden="true">
                  📍
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {item.kind === "place"
                      ? "Specific place from public posts"
                      : item.kind === "city"
                        ? "City from public posts"
                        : "Country from public posts"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {showEmptyState ? (
          <div className="px-4 py-4 text-sm text-slate-500">
            <div className="font-medium text-slate-700">No matching post places.</div>
            <div className="mt-1">Press Enter and we’ll try the map if no post matches are found.</div>
          </div>
        ) : null}

        <button
          id={`${listboxId}-option-search-all`}
          type="button"
          role="option"
          aria-selected={activeIndex === searchAllIndex}
          onMouseEnter={() => onHighlight(searchAllIndex)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onSearchAll}
          className={[
            "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition",
            suggestions.length > 0 ? "border-t border-slate-100" : "border-t border-slate-100",
            activeIndex === searchAllIndex ? "bg-slate-50" : "hover:bg-slate-50"
          ].join(" ")}
        >
          <span className="min-w-0 text-sm text-slate-600">
            <span className="font-medium text-slate-900">⏎ Search posts for </span>
            <span className="truncate">&quot;{query}&quot;</span>
            <span className="mt-1 block text-xs text-slate-500">
              If no post matches are found, the app will try the map.
            </span>
          </span>

          {isLoading || isSubmitPending ? (
            <span className="shrink-0 text-xs font-semibold text-slate-400">Loading...</span>
          ) : null}
        </button>
      </div>
    </div>
  );
}

export default function NavBar() {
  const { user, logout } = useAuth();
  const { setSelectedPlace, clearSelectedPlace } = useLocationContext();
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hoverIndex, setHoverIndex] = useState(-1);

  const [globalSearch, setGlobalSearch] = useState("");
  const [placeSuggestions, setPlaceSuggestions] = useState([]);
  const [isSuggestLoading, setIsSuggestLoading] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchActiveIndex, setSearchActiveIndex] = useState(-1);
  const [isSearchSubmitPending, setIsSearchSubmitPending] = useState(false);

  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const itemsRef = useRef([]);

  const searchWrapRef = useRef(null);
  const searchInputRef = useRef(null);
  const suggestAbortRef = useRef(null);
  const suggestReqIdRef = useRef(0);
  const submitAbortRef = useRef(null);

  const menuId = useId();
  const searchListboxId = useId();

  const displayName = useMemo(
    () => user?.username || user?.email || "Account",
    [user?.username, user?.email]
  );
  const emailLabel = useMemo(() => user?.email || "—", [user?.email]);
  const avatarInitials = useMemo(() => getAvatarInitials(user), [user]);

  const trimmedGlobalSearch = useMemo(() => globalSearch.trim(), [globalSearch]);
  const canOpenSearchDropdown = useMemo(
    () => hasMinimumSearchChars(trimmedGlobalSearch),
    [trimmedGlobalSearch]
  );
  const searchOptionCount = placeSuggestions.length + 1;

  const closeMenu = useCallback(({ restoreFocus = true } = {}) => {
    setOpen(false);
    setActiveIndex(-1);
    setHoverIndex(-1);
    if (restoreFocus) requestAnimationFrame(() => buttonRef.current?.focus());
  }, []);

  const openMenu = useCallback(() => setOpen(true), []);

  const closeSearchDropdown = useCallback(() => {
    setIsSearchOpen(false);
    setIsSuggestLoading(false);
    setSearchActiveIndex(-1);
  }, []);

  const navigateToFeedResults = useCallback(
    (query) => {
      clearSelectedPlace();
      closeSearchDropdown();
      navigate(buildFeedSearchUrl(query, location));
    },
    [clearSelectedPlace, closeSearchDropdown, location, navigate]
  );

  const handleSubmitSearch = useCallback(
    async (queryOverride) => {
      const query = String(queryOverride ?? globalSearch).trim();

      if (!query) {
        navigateToFeedResults("");
        return;
      }

      if (!hasMinimumSearchChars(query)) {
        toast.error("Type at least 3 alphanumeric characters to search.");
        return;
      }

      if (submitAbortRef.current) {
        submitAbortRef.current.abort();
      }

      const controller = new AbortController();
      submitAbortRef.current = controller;
      setIsSearchSubmitPending(true);
      closeSearchDropdown();

      try {
        const sentiment = getCurrentFeedSentiment(location);
        const feedParams = {
          q: query,
          limit: 1,
          ...(sentiment ? { sentiment } : {})
        };

        let hasFeedResults = false;
        let preflightFailed = false;

        try {
          const feedRes = await api.get("/posts", {
            params: feedParams,
            timeout: SEARCH_PREFLIGHT_TIMEOUT_MS,
            signal: controller.signal
          });

          const posts = Array.isArray(feedRes?.data?.posts) ? feedRes.data.posts : [];
          hasFeedResults = posts.length > 0;
        } catch (err) {
          if (
            err?.name === "CanceledError" ||
            err?.code === "ERR_CANCELED" ||
            err?.name === "AbortError"
          ) {
            return;
          }

          preflightFailed = true;
        }

        if (preflightFailed || hasFeedResults) {
          navigateToFeedResults(query);
          return;
        }

        let geocodeRes;
        try {
          geocodeRes = await api.post(
            "/geocode/search",
            { query },
            {
              timeout: SEARCH_GEOCODE_TIMEOUT_MS,
              signal: controller.signal
            }
          );
        } catch (err) {
          if (
            err?.name === "CanceledError" ||
            err?.code === "ERR_CANCELED" ||
            err?.name === "AbortError"
          ) {
            return;
          }

          toast.error("No matching posts were found and map lookup is unavailable right now.");
          return;
        }

        const selectedPlace = pickFirstValidGeocodeResult(geocodeRes?.data?.results);

        if (!selectedPlace) {
          toast.error(`No posts or map results found for “${query}”.`);
          return;
        }

        setSelectedPlace(selectedPlace, "search");
        closeSearchDropdown();
        navigate("/map");
      } finally {
        if (submitAbortRef.current === controller) {
          submitAbortRef.current = null;
        }
        setIsSearchSubmitPending(false);
      }
    },
    [closeSearchDropdown, globalSearch, location, navigate, navigateToFeedResults, setSelectedPlace]
  );

  const handleSelectPlaceSuggestion = useCallback(
    async (item) => {
      const searchText = getSearchTextFromSuggestion(item);
      if (!searchText) return;

      setGlobalSearch(searchText);
      await handleSubmitSearch(searchText);
    },
    [handleSubmitSearch]
  );

  useEffect(() => {
    if (location.pathname === "/feed") {
      setGlobalSearch(getFeedSearchFromLocation(location));
      closeSearchDropdown();
      setPlaceSuggestions([]);
      return;
    }

    if (location.pathname !== "/feed" && location.pathname !== "/map") {
      setPlaceSuggestions([]);
      closeSearchDropdown();
    }
  }, [location, closeSearchDropdown]);

  useEffect(() => {
    if (!open && !isSearchOpen) return;

    function onPointerDown(e) {
      const target = e.target;

      if (open && !wrapRef.current?.contains(target)) {
        closeMenu({ restoreFocus: false });
      }

      if (isSearchOpen && !searchWrapRef.current?.contains(target)) {
        closeSearchDropdown();
      }
    }

    function onKeyDown(e) {
      if (e.key === "Escape") {
        if (open) {
          e.preventDefault();
          closeMenu();
        }

        if (isSearchOpen) {
          e.preventDefault();
          closeSearchDropdown();
          requestAnimationFrame(() => searchInputRef.current?.focus());
        }
      }
    }

    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, isSearchOpen, closeMenu, closeSearchDropdown]);

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

  useEffect(() => {
    if (suggestAbortRef.current) {
      suggestAbortRef.current.abort();
      suggestAbortRef.current = null;
    }

    const query = trimmedGlobalSearch;

    if (!canOpenSearchDropdown) {
      setPlaceSuggestions([]);
      setIsSuggestLoading(false);
      setIsSearchOpen(false);
      setSearchActiveIndex(-1);
      return;
    }

    const timerId = window.setTimeout(async () => {
      const controller = new AbortController();
      suggestAbortRef.current = controller;

      const reqId = (suggestReqIdRef.current += 1);
      setIsSuggestLoading(true);

      try {
        const res = await api.get("/posts/locations/suggest", {
          params: {
            q: query,
            limit: MAX_SUGGESTIONS
          },
          signal: controller.signal,
          timeout: 10000
        });

        if (reqId !== suggestReqIdRef.current) return;

        const suggestions = Array.isArray(res?.data?.suggestions) ? res.data.suggestions : [];
        setPlaceSuggestions(suggestions);
        setIsSearchOpen(true);
        setSearchActiveIndex(-1);
      } catch (err) {
        if (
          err?.name === "CanceledError" ||
          err?.code === "ERR_CANCELED" ||
          err?.name === "AbortError"
        ) {
          return;
        }

        if (reqId !== suggestReqIdRef.current) return;

        setPlaceSuggestions([]);
        setIsSearchOpen(true);
        setSearchActiveIndex(-1);
      } finally {
        if (reqId === suggestReqIdRef.current) {
          setIsSuggestLoading(false);
        }

        if (suggestAbortRef.current === controller) {
          suggestAbortRef.current = null;
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timerId);

      if (suggestAbortRef.current) {
        suggestAbortRef.current.abort();
        suggestAbortRef.current = null;
      }
    };
  }, [trimmedGlobalSearch, canOpenSearchDropdown]);

  useEffect(() => {
    return () => {
      if (suggestAbortRef.current) {
        suggestAbortRef.current.abort();
        suggestAbortRef.current = null;
      }

      if (submitAbortRef.current) {
        submitAbortRef.current.abort();
        submitAbortRef.current = null;
      }
    };
  }, []);

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

  const onSearchInputKeyDown = useCallback(
    async (e) => {
      if (!canOpenSearchDropdown) {
        if (e.key === "Enter") {
          e.preventDefault();
          await handleSubmitSearch(trimmedGlobalSearch);
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIsSearchOpen(true);
        setSearchActiveIndex((prev) => {
          if (searchOptionCount <= 0) return -1;
          if (prev < 0) return 0;
          return Math.min(prev + 1, searchOptionCount - 1);
        });
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIsSearchOpen(true);
        setSearchActiveIndex((prev) => {
          if (searchOptionCount <= 0) return -1;
          if (prev < 0) return searchOptionCount - 1;
          return Math.max(prev - 1, 0);
        });
        return;
      }

      if (e.key === "Home" && isSearchOpen) {
        e.preventDefault();
        setSearchActiveIndex(0);
        return;
      }

      if (e.key === "End" && isSearchOpen) {
        e.preventDefault();
        setSearchActiveIndex(searchOptionCount - 1);
        return;
      }

      if (e.key === "Escape" && isSearchOpen) {
        e.preventDefault();
        closeSearchDropdown();
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();

        if (isSearchOpen && searchActiveIndex >= 0 && searchActiveIndex < placeSuggestions.length) {
          await handleSelectPlaceSuggestion(placeSuggestions[searchActiveIndex]);
          return;
        }

        await handleSubmitSearch(trimmedGlobalSearch);
      }
    },
    [
      canOpenSearchDropdown,
      closeSearchDropdown,
      handleSelectPlaceSuggestion,
      handleSubmitSearch,
      isSearchOpen,
      placeSuggestions,
      searchActiveIndex,
      searchOptionCount,
      trimmedGlobalSearch
    ]
  );

  const handleGoToProfile = useCallback(() => {
    closeMenu({ restoreFocus: false });
    navigate("/profile");
  }, [closeMenu, navigate]);

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
    () => [
      { key: "profile", label: "Profile", onSelect: handleGoToProfile, danger: false },
      { key: "logout", label: "Logout", onSelect: handleLogout, danger: true }
    ],
    [handleGoToProfile, handleLogout]
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

  return (
    <nav className="sticky top-0 z-[1100] border-b border-transparent bg-gradient-to-r from-cyan-600 via-teal-600 to-cyan-500">
      <div className="mx-auto flex h-[88px] max-w-[1400px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          to="/feed"
          className="flex shrink-0 items-center gap-3 text-white transition hover:text-cyan-100"
        >
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/30 bg-white/12 text-white shadow-sm backdrop-blur">
            <span className="text-[26px]" aria-hidden="true">
              🌐
            </span>
          </span>
          <span className="text-[22px] font-extrabold tracking-tight">GeoTravel Journal</span>
        </Link>

        <div ref={searchWrapRef} className="relative mx-auto min-w-0 max-w-3xl flex-1">
          <form
            className="w-full"
            onSubmit={async (e) => {
              e.preventDefault();
              await handleSubmitSearch(trimmedGlobalSearch);
            }}
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-400">
                🔎
              </span>

              <input
                ref={searchInputRef}
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                onFocus={() => {
                  if (canOpenSearchDropdown) {
                    setIsSearchOpen(true);
                  }
                }}
                onKeyDown={onSearchInputKeyDown}
                placeholder="Search a place..."
                aria-label="Search places"
                aria-expanded={isSearchOpen && canOpenSearchDropdown}
                aria-controls={searchListboxId}
                aria-activedescendant={
                  isSearchOpen && searchActiveIndex >= 0
                    ? searchActiveIndex < placeSuggestions.length
                      ? `${searchListboxId}-option-${searchActiveIndex}`
                      : `${searchListboxId}-option-search-all`
                    : undefined
                }
                className="w-full rounded-[24px] border border-white/25 bg-white/88 px-14 py-4 text-lg text-slate-900 shadow-sm outline-none backdrop-blur transition placeholder:text-slate-500 focus:border-white/70 focus:bg-white focus:ring-4 focus:ring-white/20"
              />
            </div>
          </form>

          <SearchDropdown
            open={isSearchOpen && canOpenSearchDropdown}
            listboxId={searchListboxId}
            isLoading={isSuggestLoading}
            isSubmitPending={isSearchSubmitPending}
            query={trimmedGlobalSearch}
            suggestions={placeSuggestions}
            activeIndex={searchActiveIndex}
            onHighlight={setSearchActiveIndex}
            onSelectSuggestion={handleSelectPlaceSuggestion}
            onSearchAll={() => handleSubmitSearch(trimmedGlobalSearch)}
          />
        </div>

        <Link
          to="/posts/new"
          className="shrink-0 rounded-[20px] border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white shadow-sm backdrop-blur transition hover:bg-white/18"
        >
          +&nbsp; New Post
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
            className="flex items-center gap-3 rounded-[22px] border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-medium text-white shadow-sm backdrop-blur transition hover:bg-white/18"
          >
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/30 bg-white/20 text-xs font-bold text-white">
              {avatarInitials}
            </span>
            <span className="max-w-[160px] truncate text-lg font-semibold">{displayName}</span>
            <span className="text-xs opacity-80">{open ? "▲" : "▼"}</span>
          </button>

          {open && (
            <div
              id={menuId}
              role="menu"
              aria-label="Account menu"
              onKeyDown={onMenuKeyDown}
              className="absolute right-0 top-full z-[1101] mt-3 min-w-[240px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
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
                          ? "bg-slate-50"
                          : "hover:bg-slate-50",
                        it.danger ? "text-rose-600" : "text-slate-700"
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
