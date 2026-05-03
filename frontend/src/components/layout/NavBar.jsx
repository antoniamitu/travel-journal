// frontend/src/components/layout/NavBar.jsx
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../../api/axios.js";
import { searchAccounts } from "../../api/users.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useLocationContext } from "../../hooks/useLocationContext.js";
import { isKnownPlaceCategory } from "../../utils/placeCategoryUi.js";

const SEARCH_DEBOUNCE_MS = 500;
const SEARCH_PREFLIGHT_TIMEOUT_MS = 4000;
const SEARCH_GEOCODE_TIMEOUT_MS = 5000;
const MIN_SUGGEST_CHARS = 3;
const MAX_SUGGESTIONS = 5;
const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC_RE = /[^a-z0-9]+/g;


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

function isAbortLikeError(err) {
  return (
    err?.name === "CanceledError" ||
    err?.code === "ERR_CANCELED" ||
    err?.name === "AbortError"
  );
}

function getFeedSearchFromLocation(location) {
  if (location.pathname !== "/feed") {
    return "";
  }

  const params = new URLSearchParams(location.search);
  return String(params.get("q") || "").trim();
}

function getCurrentFeedSentiment(location) {
  if (location.pathname !== "/feed") {
    return "";
  }

  const params = new URLSearchParams(location.search);
  const sentiment = String(params.get("sentiment") || "").trim().toLowerCase();
  return ["positive", "neutral", "negative"].includes(sentiment) ? sentiment : "";
}

function getCurrentFeedCategory(location) {
  if (location.pathname !== "/feed") {
    return "";
  }

  const params = new URLSearchParams(location.search);
  const category = String(params.get("category") || "").trim().toLowerCase();

  return isKnownPlaceCategory(category) ? category : "";
}

function buildFeedSearchUrl(query, currentLocation) {
  const params = new URLSearchParams();

  const trimmedQuery = String(query || "").trim();
  const currentSentiment = getCurrentFeedSentiment(currentLocation);
  const currentCategory = getCurrentFeedCategory(currentLocation);

  if (trimmedQuery) {
    params.set("q", trimmedQuery);
  }

  if (currentSentiment) {
    params.set("sentiment", currentSentiment);
  }

  if (currentCategory) {
    params.set("category", currentCategory);
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

function BrandPinIcon({ className = "h-6 w-6" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s6.8-4.6 6.8-10.8a6.8 6.8 0 1 0-13.6 0C5.2 16.4 12 21 12 21Z" />
      <circle cx="12" cy="10.2" r="2.35" />
    </svg>
  );
}

function SearchIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function PlusIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function UserCircleIcon({ className = "h-6 w-6" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

function SearchDropdown({
  open,
  listboxId,
  isLoading,
  isSubmitPending,
  query,
  placeSuggestions,
  accountSuggestions,
  activeIndex,
  onHighlight,
  onSelectPlaceSuggestion,
  onSelectAccountSuggestion,
  onSearchAll
}) {
  if (!open) return null;

  const placeCount = placeSuggestions.length;
  const accountCount = accountSuggestions.length;
  const totalSuggestionCount = placeCount + accountCount;
  const searchAllIndex = totalSuggestionCount;
  const showEmptyState = !isLoading && totalSuggestionCount === 0;

  return (
    <div className="absolute left-0 right-0 top-full z-[1200] mt-2 overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)] md:mt-3 md:rounded-[24px]">
      <div id={listboxId} role="listbox" aria-label="Place and account suggestions">
        {placeCount > 0 ? (
          <>
            <div className="border-b border-slate-100 px-4 pt-3 pb-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">
                🖼️ Post places
              </div>
            </div>

            <div className="py-1.5">
              {placeSuggestions.map((item, index) => (
                <button
                  key={`${item.kind}-${item.queryValue}-${item.city || ""}-${item.country || ""}-${item.label}`}
                  id={`${listboxId}-place-${index}`}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === index}
                  onMouseEnter={() => onHighlight(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSelectPlaceSuggestion(item)}
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
          </>
        ) : null}

        {accountCount > 0 ? (
          <>
            <div className="border-t border-slate-100 px-4 pt-3 pb-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
                👤 Accounts
              </div>
            </div>

            <div className="py-1.5">
              {accountSuggestions.map((item, index) => {
                const optionIndex = placeCount + index;

                return (
                  <button
                    key={`${item.username}-${item.label}`}
                    id={`${listboxId}-account-${index}`}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === optionIndex}
                    onMouseEnter={() => onHighlight(optionIndex)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onSelectAccountSuggestion(item)}
                    className={[
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition",
                      activeIndex === optionIndex ? "bg-slate-50" : "hover:bg-slate-50"
                    ].join(" ")}
                  >
                    <span className="mt-0.5 text-base" aria-hidden="true">
                      👤
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Open this traveler&apos;s profile
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        {showEmptyState ? (
          <div className="px-4 py-4 text-sm text-slate-500">
            <div className="font-medium text-slate-700">No matching places or accounts.</div>
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
            "flex w-full items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-left transition",
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
  const [accountSuggestions, setAccountSuggestions] = useState([]);
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
  const suppressSuggestForQueryRef = useRef("");
  const submitAbortRef = useRef(null);

  const menuId = useId();
  const searchListboxId = useId();

  const displayName = useMemo(
    () => user?.username || user?.email || "Account",
    [user?.username, user?.email]
  );
  const emailLabel = useMemo(() => user?.email || "—", [user?.email]);

  const trimmedGlobalSearch = useMemo(() => globalSearch.trim(), [globalSearch]);
  const canOpenSearchDropdown = useMemo(
    () => hasMinimumSearchChars(trimmedGlobalSearch),
    [trimmedGlobalSearch]
  );

  const totalSuggestionCount = placeSuggestions.length + accountSuggestions.length;
  const searchOptionCount = totalSuggestionCount + 1;

  const activeDescendantId = useMemo(() => {
    if (!isSearchOpen || searchActiveIndex < 0) return undefined;

    if (searchActiveIndex < placeSuggestions.length) {
      return `${searchListboxId}-place-${searchActiveIndex}`;
    }

    const accountIndex = searchActiveIndex - placeSuggestions.length;
    if (accountIndex >= 0 && accountIndex < accountSuggestions.length) {
      return `${searchListboxId}-account-${accountIndex}`;
    }

    return `${searchListboxId}-option-search-all`;
  }, [
    accountSuggestions.length,
    isSearchOpen,
    placeSuggestions.length,
    searchActiveIndex,
    searchListboxId
  ]);

  const closeMenu = useCallback(({ restoreFocus = true } = {}) => {
    setOpen(false);
    setActiveIndex(-1);
    setHoverIndex(-1);

    if (restoreFocus) {
      requestAnimationFrame(() => {
        buttonRef.current?.focus();
      });
    }
  }, []);

  const openMenu = useCallback(() => {
    setOpen(true);
  }, []);

  const closeSearchDropdown = useCallback(() => {
    setIsSearchOpen(false);
    setIsSuggestLoading(false);
    setSearchActiveIndex(-1);
  }, []);

  const resetSuggestionState = useCallback(() => {
    setPlaceSuggestions([]);
    setAccountSuggestions([]);
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

  const handleClearSearchInput = useCallback(() => {
    suggestReqIdRef.current += 1;
    suppressSuggestForQueryRef.current = "";

    if (suggestAbortRef.current) {
      suggestAbortRef.current.abort();
      suggestAbortRef.current = null;
    }

    if (submitAbortRef.current) {
      submitAbortRef.current.abort();
      submitAbortRef.current = null;
    }

    setIsSearchSubmitPending(false);
    setGlobalSearch("");
    resetSuggestionState();
    closeSearchDropdown();

    if (location.pathname === "/feed" && getFeedSearchFromLocation(location)) {
      navigate(buildFeedSearchUrl("", location));
      return;
    }

    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [closeSearchDropdown, location, navigate, resetSuggestionState]);

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
      suppressSuggestForQueryRef.current = query;
      suggestReqIdRef.current += 1;

      if (suggestAbortRef.current) {
        suggestAbortRef.current.abort();
        suggestAbortRef.current = null;
      }

      resetSuggestionState();
      closeSearchDropdown();

      if (submitAbortRef.current) {
        submitAbortRef.current.abort();
      }

      const controller = new AbortController();
      submitAbortRef.current = controller;
      setIsSearchSubmitPending(true);
      closeSearchDropdown();

      try {
        const sentiment = getCurrentFeedSentiment(location);
        const category = getCurrentFeedCategory(location);
        const feedParams = {
          q: query,
          limit: 1,
          ...(sentiment ? { sentiment } : {}),
          ...(category ? { category } : {})
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
          if (isAbortLikeError(err)) {
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
          if (isAbortLikeError(err)) {
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
          setIsSearchSubmitPending(false);
        }
      }
    },
    [closeSearchDropdown,globalSearch,location,navigate,navigateToFeedResults,resetSuggestionState,setSelectedPlace]
  );

  const handleSelectPlaceSuggestion = useCallback(
    async (item) => {
      const searchText = getSearchTextFromSuggestion(item);
      if (!searchText) return;

      suppressSuggestForQueryRef.current = searchText;
      suggestReqIdRef.current += 1;

      if (suggestAbortRef.current) {
        suggestAbortRef.current.abort();
        suggestAbortRef.current = null;
      }

      resetSuggestionState();
      closeSearchDropdown();
      setGlobalSearch(searchText);
      await handleSubmitSearch(searchText);
    },
    [closeSearchDropdown, handleSubmitSearch, resetSuggestionState]
  );

  const handleSelectAccountSuggestion = useCallback(
    (item) => {
      const username = String(item?.username || "").trim();
      if (!username) return;
      suggestReqIdRef.current += 1;

      if (suggestAbortRef.current) {
        suggestAbortRef.current.abort();
        suggestAbortRef.current = null;
      }

      if (submitAbortRef.current) {
        submitAbortRef.current.abort();
        submitAbortRef.current = null;
      }

      setIsSearchSubmitPending(false);

      clearSelectedPlace();
      setGlobalSearch("");
      resetSuggestionState();
      closeSearchDropdown();
      navigate(`/users/${encodeURIComponent(username)}`);
        },
        [clearSelectedPlace, closeSearchDropdown, navigate, resetSuggestionState]
      );

  useEffect(() => {
    if (location.pathname === "/feed") {
      const feedSearch = getFeedSearchFromLocation(location);

      suppressSuggestForQueryRef.current = feedSearch;
      setGlobalSearch(feedSearch);
      closeSearchDropdown();
      resetSuggestionState();
      return;
    }

    if (location.pathname !== "/feed" && location.pathname !== "/map") {
      suppressSuggestForQueryRef.current = "";
      resetSuggestionState();
      closeSearchDropdown();
    }
  }, [location, closeSearchDropdown, resetSuggestionState]);

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
  const suppressedQuery = suppressSuggestForQueryRef.current;

  if (suppressedQuery) {
    if (query === suppressedQuery) {
      suppressSuggestForQueryRef.current = "";
      resetSuggestionState();
      setIsSuggestLoading(false);
      setIsSearchOpen(false);
      return;
    }

    suppressSuggestForQueryRef.current = "";
  }

  const requestId = (suggestReqIdRef.current += 1);

  if (!canOpenSearchDropdown) {
      resetSuggestionState();
      setIsSuggestLoading(false);
      setIsSearchOpen(false);
      return;
    }

    let controller = null;

    const timerId = window.setTimeout(async () => {
      controller = new AbortController();
      suggestAbortRef.current = controller;
      setIsSuggestLoading(true);

      try {
        const [placesResult, accountsResult] = await Promise.allSettled([
          api.get("/posts/locations/suggest", {
            params: {
              q: query,
              limit: MAX_SUGGESTIONS
            },
            signal: controller.signal,
            timeout: 10000
          }),
          searchAccounts(
            query,
            { limit: MAX_SUGGESTIONS },
            {
              signal: controller.signal,
              timeout: 10000
            }
          )
        ]);

        if (requestId !== suggestReqIdRef.current) {
          return;
        }

        const placesAborted =
          placesResult.status === "rejected" && isAbortLikeError(placesResult.reason);
        const accountsAborted =
          accountsResult.status === "rejected" && isAbortLikeError(accountsResult.reason);

        if (placesAborted && accountsAborted) {
          return;
        }

        const nextPlaceSuggestions =
          placesResult.status === "fulfilled"
            ? Array.isArray(placesResult.value?.data?.suggestions)
              ? placesResult.value.data.suggestions
              : []
            : [];

        const nextAccountSuggestions =
          accountsResult.status === "fulfilled" && Array.isArray(accountsResult.value)
            ? accountsResult.value
            : [];

        const hadAnySuccess =
          placesResult.status === "fulfilled" || accountsResult.status === "fulfilled";

        if (!hadAnySuccess) {
          resetSuggestionState();
          setIsSearchOpen(false);
          return;
        }

        setPlaceSuggestions(nextPlaceSuggestions);
        setAccountSuggestions(nextAccountSuggestions);
        setIsSearchOpen(true);
        setSearchActiveIndex(-1);
      } finally {
        if (requestId === suggestReqIdRef.current) {
          setIsSuggestLoading(false);
        }

        if (suggestAbortRef.current === controller) {
          suggestAbortRef.current = null;
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timerId);

      if (controller) {
        controller.abort();
      }

      if (suggestAbortRef.current === controller) {
        suggestAbortRef.current = null;
      }
    };
  }, [trimmedGlobalSearch, canOpenSearchDropdown, resetSuggestionState]);

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

        if (!open) {
          openMenu();
        } else {
          requestAnimationFrame(() => itemsRef.current?.[0]?.focus());
        }
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

        if (isSearchOpen && searchActiveIndex >= 0) {
          if (searchActiveIndex < placeSuggestions.length) {
            await handleSelectPlaceSuggestion(placeSuggestions[searchActiveIndex]);
            return;
          }

          const accountIndex = searchActiveIndex - placeSuggestions.length;
          if (accountIndex >= 0 && accountIndex < accountSuggestions.length) {
            handleSelectAccountSuggestion(accountSuggestions[accountIndex]);
            return;
          }
        }

        await handleSubmitSearch(trimmedGlobalSearch);
      }
    },
    [
      accountSuggestions,
      canOpenSearchDropdown,
      closeSearchDropdown,
      handleSelectAccountSuggestion,
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
      if (maybePromise && typeof maybePromise.then === "function") {
        await maybePromise;
      }
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
    <nav className="sticky top-0 z-[1100] bg-white/92 backdrop-blur-xl">
      <div className="mx-auto flex h-[88px] w-full max-w-[1480px] items-center gap-3 px-4 sm:gap-4 sm:px-6 lg:h-[96px] lg:gap-6 lg:px-8">
        <Link
          to="/feed"
          className="group flex min-w-0 shrink-0 items-center gap-3 transition focus:outline-none"
        >
          <span className="inline-flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-r from-teal-500 to-teal-700 text-white shadow-[0_18px_42px_rgba(8,145,178,0.28),0_0_34px_rgba(16,185,129,0.20)] ring-4 ring-cyan-50 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_22px_52px_rgba(8,145,178,0.34),0_0_42px_rgba(16,185,129,0.26)] group-focus-visible:-translate-y-0.5 group-focus-visible:shadow-[0_22px_52px_rgba(8,145,178,0.36),0_0_46px_rgba(16,185,129,0.30)] group-active:translate-y-0">
            <BrandPinIcon className="h-8 w-8" />
          </span>

          <span className="hidden min-w-0 sm:block">
            <span className="block truncate text-[22px] font-extrabold tracking-tight text-teal-700 lg:text-[24px]">
              GeoTravel
            </span>
            <span className="mt-[-2px] block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 lg:text-xs">
              Journal
            </span>
          </span>
        </Link>

        <div ref={searchWrapRef} className="relative min-w-0 flex-1">
          <form
            className="w-full"
            onSubmit={async (e) => {
              e.preventDefault();
              await handleSubmitSearch(trimmedGlobalSearch);
            }}
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-400">
                <SearchIcon className="h-5 w-5" />
              </span>

              <input
                ref={searchInputRef}
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                onFocus={() => {
                  if (
                    canOpenSearchDropdown &&
                    (isSuggestLoading || placeSuggestions.length > 0 || accountSuggestions.length > 0)
                  ) {
                    setIsSearchOpen(true);
                  }
                }}
                onKeyDown={onSearchInputKeyDown}
                placeholder="Search destinations, experiences..."
                aria-label="Search places or accounts"
                aria-expanded={isSearchOpen && canOpenSearchDropdown}
                aria-controls={searchListboxId}
                aria-activedescendant={activeDescendantId}
                className="w-full rounded-full border border-slate-200 bg-white px-12 py-3 pr-12 text-sm text-slate-900 shadow-[0_12px_32px_rgba(15,23,42,0.07)] outline-none transition-all duration-300 placeholder:text-slate-400 hover:border-slate-300 hover:shadow-[0_16px_36px_rgba(15,118,110,0.22)] focus:border-slate-400 focus:shadow-[0_22px_52px_rgba(15,118,110,0.44)] focus:ring-0 sm:px-14 sm:py-3.5 sm:text-base lg:px-16 lg:py-4"
              />

              {trimmedGlobalSearch ? (
                <button
                  type="button"
                  onClick={handleClearSearchInput}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  ✕
                </button>
              ) : null}
            </div>
          </form>

          <SearchDropdown
            open={isSearchOpen && canOpenSearchDropdown}
            listboxId={searchListboxId}
            isLoading={isSuggestLoading}
            isSubmitPending={isSearchSubmitPending}
            query={trimmedGlobalSearch}
            placeSuggestions={placeSuggestions}
            accountSuggestions={accountSuggestions}
            activeIndex={searchActiveIndex}
            onHighlight={setSearchActiveIndex}
            onSelectPlaceSuggestion={handleSelectPlaceSuggestion}
            onSelectAccountSuggestion={handleSelectAccountSuggestion}
            onSearchAll={() => handleSubmitSearch(trimmedGlobalSearch)}
          />
        </div>

        <Link
          to="/posts/new"
          className="group relative inline-flex min-h-[56px] shrink-0 items-center rounded-full bg-gradient-to-r from-teal-500 to-teal-700 px-5 py-3 text-sm font-bold text-white shadow-[0_18px_46px_rgba(8,145,178,0.34),0_0_34px_rgba(16,185,129,0.26)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(8,145,178,0.48),0_0_46px_rgba(16,185,129,0.40)] focus:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-teal-300/55 focus:shadow-[0_0_0_7px_rgba(45,212,191,0.24),0_26px_68px_rgba(8,145,178,0.52),0_0_52px_rgba(16,185,129,0.45)] active:translate-y-0 sm:px-7 sm:text-base"
          aria-label="Create a new post"
        >
          <PlusIcon className="h-5 w-5 transition-transform duration-500 group-hover:rotate-180 group-focus-visible:rotate-180 group-active:rotate-180" />
          <span className="ml-2 hidden min-[420px]:inline">New Post</span>
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
            aria-label={`Open account menu for ${displayName}`}
            className="inline-flex h-[56px] w-[56px] items-center justify-center rounded-full border border-transparent bg-slate-50 text-slate-600 shadow-[0_14px_28px_rgba(15,23,42,0.10)] ring-4 ring-cyan-50 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-300/55 hover:bg-cyan-50 hover:text-cyan-700 hover:shadow-[0_18px_38px_rgba(8,145,178,0.20),0_0_30px_rgba(16,185,129,0.14)] focus:outline-none focus-visible:-translate-y-0.5 focus-visible:border-cyan-300/70 focus-visible:bg-cyan-50 focus-visible:text-cyan-700 focus-visible:shadow-[0_18px_38px_rgba(8,145,178,0.24),0_0_34px_rgba(16,185,129,0.18)] focus-visible:ring-cyan-200/55 active:translate-y-0"
          >
            <UserCircleIcon className="h-6 w-6" />
          </button>

          {open && (
            <div
              id={menuId}
              role="menu"
              aria-label="Account menu"
              onKeyDown={onMenuKeyDown}
              className="absolute right-0 top-full z-[1101] mt-3 min-w-[220px] overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)] md:min-w-[240px]"
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
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-cyan-300/80 via-cyan-400 to-emerald-400 shadow-[0_0_14px_rgba(45,212,191,0.50)]" />
    </nav>
  );
}