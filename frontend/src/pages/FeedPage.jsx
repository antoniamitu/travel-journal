//src/pages/FeedPage.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/axios.js";
import { listFeedPosts } from "../api/posts.js";
import { useLocationContext } from "../hooks/useLocationContext.js";

const DEFAULT_PAGE_SIZE = 12;
const AI_COOLDOWN_MS = 60_000;

const DEFAULT_FEED_FILTERS = {
  q: "",
  sentiment: "all",
  category: "all"
};

const FEED_SENTIMENT_OPTIONS = [
  { key: "all", label: "All" },
  { key: "positive", label: "Positive" },
  { key: "neutral", label: "Neutral" },
  { key: "negative", label: "Negative" }
];

const FEED_CATEGORY_OPTIONS = [
  { key: "all", label: "All categories" },
  { key: "historical", label: "Historical" },
  { key: "religious", label: "Religious" },
  { key: "nature", label: "Nature" },
  { key: "entertainment", label: "Entertainment" },
  { key: "food_drink", label: "Food & Drink" },
  { key: "shopping", label: "Shopping" },
  { key: "urban_landmark", label: "Urban Landmark" },
  { key: "other", label: "Other" }
];

const PLACE_CATEGORY_UI = {
  historical: {
    label: "Historical",
    icon: "🏛️",
    badge: "bg-stone-100 text-stone-700 ring-stone-200"
  },
  religious: {
    label: "Religious",
    icon: "🕍",
    badge: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200"
  },
  nature: {
    label: "Nature",
    icon: "🌿",
    badge: "bg-green-50 text-green-700 ring-green-200"
  },
  entertainment: {
    label: "Entertainment",
    icon: "🎭",
    badge: "bg-indigo-50 text-indigo-700 ring-indigo-200"
  },
  food_drink: {
    label: "Food & Drink",
    icon: "🍽️",
    badge: "bg-orange-50 text-orange-700 ring-orange-200"
  },
  shopping: {
    label: "Shopping",
    icon: "🛍️",
    badge: "bg-pink-50 text-pink-700 ring-pink-200"
  },
  urban_landmark: {
    label: "Urban Landmark",
    icon: "🏙️",
    badge: "bg-cyan-50 text-cyan-700 ring-cyan-200"
  },
  other: {
    label: "Other",
    icon: "📍",
    badge: "bg-slate-100 text-slate-700 ring-slate-200"
  }
};

function normalizeFeedCategory(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PLACE_CATEGORY_UI, normalized) ? normalized : "other";
}

function getPlaceCategoryUi(category) {
  return PLACE_CATEGORY_UI[normalizeFeedCategory(category)] || PLACE_CATEGORY_UI.other;
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium"
  }).format(date);
}

function optimizeCloudinaryUrl(secureUrl, variant = "card") {
  if (typeof secureUrl !== "string" || !secureUrl.includes("/upload/")) {
    return secureUrl || "";
  }

  const transform =
    variant === "thumb"
      ? "c_fill,w_700,h_520,g_auto,f_auto,q_auto"
      : "c_fill,w_1400,h_900,g_auto,f_auto,q_auto";

  return secureUrl.replace("/upload/", `/upload/${transform}/`);
}

function getSentimentUi(sentiment) {
  switch (sentiment) {
    case "positive":
      return {
        emoji: "😊",
        label: "Positive",
        badge: "bg-emerald-50 text-emerald-700 ring-emerald-200"
      };
    case "negative":
      return {
        emoji: "😞",
        label: "Negative",
        badge: "bg-rose-50 text-rose-700 ring-rose-200"
      };
    default:
      return {
        emoji: "😐",
        label: "Neutral",
        badge: "bg-amber-50 text-amber-700 ring-amber-200"
      };
  }
}

function getPrivacyUi(privacy) {
  if (privacy === "public") {
    return {
      icon: "🌍",
      label: "Public",
      badge: "bg-sky-50 text-sky-700 ring-sky-200"
    };
  }

  return {
    icon: "🔒",
    label: "Private",
    badge: "bg-slate-100 text-slate-700 ring-slate-200"
  };
}

function normalizePreviewImages(post) {
  const previewImages = Array.isArray(post?.previewImages)
    ? post.previewImages.filter((item) => typeof item === "string" && item.trim() !== "")
    : [];

  if (previewImages.length > 0) return previewImages;

  if (typeof post?.previewImage === "string" && post.previewImage.trim()) {
    return [post.previewImage];
  }

  return [];
}

function buildAiPayload(post) {
  const locationName = String(post?.locationName || "").trim();
  const latitude = Number(post?.latitude);
  const longitude = Number(post?.longitude);

  const city = typeof post?.city === "string" && post.city.trim() ? post.city.trim() : undefined;
  const country =
    typeof post?.country === "string" && post.country.trim() ? post.country.trim() : undefined;

  return {
    locationName,
    latitude,
    longitude,
    ...(city ? { city } : {}),
    ...(country ? { country } : {})
  };
}

function getAiLocationLabel(post) {
  return post?.locationName || [post?.city, post?.country].filter(Boolean).join(", ") || "this location";
}

function mergeUniquePosts(existing, incoming) {
  const map = new Map();

  for (const item of existing) {
    map.set(item.id, item);
  }

  for (const item of incoming) {
    map.set(item.id, item);
  }

  return Array.from(map.values()).sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();

    if (bTime !== aTime) return bTime - aTime;
    return Number(b.id || 0) - Number(a.id || 0);
  });
}

function getDefaultAiState() {
  return {
    status: "idle",
    content: "",
    error: "",
    source: "",
    cooldownUntil: 0
  };
}

function patchAiStateSetter(setter, postId, patch) {
  if (!postId) return;

  setter((prev) => ({
    ...prev,
    [postId]: {
      ...(prev[postId] || getDefaultAiState()),
      ...patch
    }
  }));
}

function dedupeParts(parts) {
  const seen = new Set();
  const out = [];

  for (const part of parts) {
    const value = String(part || "").trim();
    if (!value) continue;

    const key = value.toLocaleLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(value);
  }

  return out;
}

function buildMapSelection(post) {
  const lat = Number(post?.latitude);
  const lng = Number(post?.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const parts = dedupeParts([post?.locationName, post?.city, post?.country]);

  return {
    lat,
    lng,
    locationName: post?.locationName || "",
    displayName: parts.join(", "),
    city: post?.city || null,
    country: post?.country || null
  };
}

function hasActiveFeedFilters(filters) {
  return (
    Boolean(String(filters?.q || "").trim()) ||
    filters?.sentiment !== "all" ||
    filters?.category !== "all"
  );
}

function SafeFeedImage({ src, alt, className }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (!src || hasError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 px-4 text-center text-sm text-slate-500">
        Image unavailable
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}

function FeedHero() {
  return (
    <section className="rounded-[32px] border border-slate-200/80 bg-white px-6 py-7 shadow-sm lg:px-8">
      <div>
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
          Travel feed
        </div>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900">
          Public travel posts ✨
        </h1>
        <p className="mt-4 max-w-4xl text-base leading-8 text-slate-600">
          Browse public posts from other travelers, open places on the map, or ask AI for quick
          historical and cultural context.
        </p>
      </div>
    </section>
  );
}

function FeedFiltersBar({
  filters,
  isBusy,
  onSentimentChange,
  onCategoryChange,
  onClearSentiment,
  onClearCategory,
  onClearSearch
}) {
  const hasFilters = hasActiveFeedFilters(filters);

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm lg:px-6">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
              Feed filters
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              Refine the current search
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Use the top navigation search bar for places, then narrow the feed here by sentiment
              or place category.
            </p>
          </div>

          {hasFilters ? (
            <div className="flex flex-wrap gap-3">
              {filters.q ? (
                <button
                  type="button"
                  onClick={onClearSearch}
                  disabled={isBusy}
                  className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Clear search
                </button>
              ) : null}

              {filters.sentiment !== "all" ? (
                <button
                  type="button"
                  onClick={onClearSentiment}
                  disabled={isBusy}
                  className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Clear sentiment
                </button>
              ) : null}

              {filters.category !== "all" ? (
                <button
                  type="button"
                  onClick={onClearCategory}
                  disabled={isBusy}
                  className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Clear category
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Sentiment
          </div>

          <div className="mt-3 flex flex-wrap gap-3">
            {FEED_SENTIMENT_OPTIONS.map((option) => {
              const active = filters.sentiment === option.key;

              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onSentimentChange(option.key)}
                  disabled={isBusy}
                  className={[
                    "inline-flex min-h-10 items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold transition",
                    active
                      ? "bg-slate-900 text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                    isBusy ? "disabled:cursor-not-allowed disabled:opacity-60" : ""
                  ].join(" ")}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Place category
          </div>

          <div className="mt-3 flex flex-wrap gap-3">
            {FEED_CATEGORY_OPTIONS.map((option) => {
              const active = filters.category === option.key;

              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onCategoryChange(option.key)}
                  disabled={isBusy}
                  className={[
                    "inline-flex min-h-10 items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold transition",
                    active
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                    isBusy ? "disabled:cursor-not-allowed disabled:opacity-60" : ""
                  ].join(" ")}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {hasFilters ? (
          <div className="flex flex-wrap gap-2">
            {filters.q ? (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                Search: {filters.q}
              </span>
            ) : null}

            {filters.sentiment !== "all" ? (
              <span className="inline-flex items-center rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">
                Sentiment: {filters.sentiment}
              </span>
            ) : null}

            {filters.category !== "all" ? (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getPlaceCategoryUi(filters.category).badge}`}
              >
                <span aria-hidden="true">{getPlaceCategoryUi(filters.category).icon}</span>
                <span>Category: {getPlaceCategoryUi(filters.category).label}</span>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FeedSkeletonCard() {
  return (
    <article className="overflow-hidden rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
      <div className="animate-pulse">
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-7 w-24 rounded-full bg-slate-100" />
          <div className="h-7 w-20 rounded-full bg-slate-100" />
          <div className="h-7 w-28 rounded-full bg-slate-100" />
        </div>

        <div className="mt-5 h-9 w-2/3 rounded-2xl bg-slate-200" />
        <div className="mt-3 h-5 w-1/3 rounded-xl bg-slate-100" />
        <div className="mt-2 h-5 w-1/4 rounded-xl bg-slate-100" />

        <div className="mt-6 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="h-[340px] rounded-[24px] bg-slate-100" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="h-[164px] rounded-[24px] bg-slate-100" />
            <div className="h-[164px] rounded-[24px] bg-slate-100" />
          </div>
        </div>

        <div className="mt-6 h-5 w-full rounded-xl bg-slate-100" />
        <div className="mt-2 h-5 w-[92%] rounded-xl bg-slate-100" />
        <div className="mt-2 h-5 w-[78%] rounded-xl bg-slate-100" />

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="h-11 rounded-2xl bg-slate-100" />
          <div className="h-11 rounded-2xl bg-slate-100" />
          <div className="h-11 rounded-2xl bg-slate-100" />
        </div>
      </div>
    </article>
  );
}

function EmptyFeedState({ filters }) {
  const hasFilters = hasActiveFeedFilters(filters);

  return (
    <section className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-10 text-center shadow-sm">
      <h2 className="text-2xl font-semibold text-slate-900">
        {hasFilters ? "No posts match your filters" : "No public posts yet"}
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">
        {hasFilters
          ? "Try clearing the current search or removing the current sentiment/category filters to see more results."
          : "There are no public posts from other travelers yet. Check back later or explore the map."}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/map"
          className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Explore the map
        </Link>

        <Link
          to="/posts/new"
          className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Create your own post
        </Link>
      </div>
    </section>
  );
}

function FeedImageGallery({ post }) {
  const images = normalizePreviewImages(post);
  const remaining = Math.max(0, Number(post?.imageCount || 0) - images.length);

  if (images.length === 0) {
    return (
      <div className="mt-6 rounded-[26px] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
        No preview images for this post.
      </div>
    );
  }

  if (images.length === 1) {
    return (
      <div className="mt-6 overflow-hidden rounded-[26px] border border-slate-200 bg-slate-50">
        <SafeFeedImage
          src={optimizeCloudinaryUrl(images[0], "card")}
          alt={post.title}
          className="h-[360px] w-full object-cover"
        />
      </div>
    );
  }

  const first = images[0];
  const second = images[1];
  const third = images[2] || null;

  return (
    <div className="mt-6 grid gap-3 lg:grid-cols-[1.18fr_0.82fr]">
      <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-slate-50">
        <SafeFeedImage
          src={optimizeCloudinaryUrl(first, "card")}
          alt={`${post.title} preview 1`}
          className="h-[360px] w-full object-cover"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-slate-50">
          <SafeFeedImage
            src={optimizeCloudinaryUrl(second, "thumb")}
            alt={`${post.title} preview 2`}
            className="h-[173px] w-full object-cover"
          />
        </div>

        {third ? (
          <div className="relative overflow-hidden rounded-[26px] border border-slate-200 bg-slate-50">
            <SafeFeedImage
              src={optimizeCloudinaryUrl(third, "thumb")}
              alt={`${post.title} preview 3`}
              className="h-[173px] w-full object-cover"
            />

            {remaining > 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/45">
                <span className="rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-slate-900">
                  +{remaining} more
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-[26px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            {post.imageCount} image{post.imageCount === 1 ? "" : "s"} attached
          </div>
        )}
      </div>
    </div>
  );
}

function FeedPostCard({ post, aiState, aiRemainingSeconds, onRequestLearnMore, onOpenOnMap }) {
  const sentimentUi = getSentimentUi(post.sentiment);
  const privacyUi = getPrivacyUi(post.privacy);
  const placeCategoryUi = getPlaceCategoryUi(post.placeCategory);

  const aiStatus = aiState?.status || "idle";
  const aiContent = aiState?.content || "";
  const aiError = aiState?.error || "";
  const aiSource = aiState?.source || "";

  const hasAiContent = Boolean(aiContent);
  const isAiLoading = aiStatus === "loading";
  const aiCardVisible = isAiLoading || Boolean(aiError) || hasAiContent;

  const aiButtonLabel =
    aiRemainingSeconds > 0
      ? `Try again in ${aiRemainingSeconds}s`
      : isAiLoading
        ? "Loading..."
        : aiError
          ? "Retry Learn More"
          : hasAiContent
            ? "Refresh Learn More"
            : "Learn More";

  return (
    <article className="overflow-hidden rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md lg:p-6">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${sentimentUi.badge}`}
          >
            <span aria-hidden="true">{sentimentUi.emoji}</span>
            <span>{sentimentUi.label}</span>
          </span>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${privacyUi.badge}`}
          >
            <span aria-hidden="true">{privacyUi.icon}</span>
            <span>{privacyUi.label}</span>
          </span>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${placeCategoryUi.badge}`}
          >
            <span aria-hidden="true">{placeCategoryUi.icon}</span>
            <span>{placeCategoryUi.label}</span>
          </span>

          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {formatDate(post.createdAt)}
          </span>

          {post.imageCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {post.imageCount} image{post.imageCount === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 lg:text-[2rem]">
            {post.title}
          </h2>

          <div className="mt-3 flex flex-col gap-1 text-sm text-slate-500 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
            <Link
              to={`/users/${encodeURIComponent(post.username)}`}
              className="font-semibold text-emerald-700 transition hover:text-emerald-800 hover:underline"
            >
              By @{post.username}
            </Link>
            <span>📍 {post.locationName}</span>
            {(post.city || post.country) && (
              <span>{dedupeParts([post.city, post.country]).join(", ")}</span>
            )}
          </div>
        </div>

        <FeedImageGallery post={post} />

        <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Preview
          </div>
          <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-700 lg:text-[15px]">
            {post.contentPreview || "No preview available."}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            to={`/posts/${post.id}`}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            View Full Post
          </Link>

          <button
            type="button"
            onClick={() => onOpenOnMap(post)}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Open on Map
          </button>

          <button
            type="button"
            onClick={() => onRequestLearnMore(post)}
            disabled={aiRemainingSeconds > 0 || isAiLoading}
            aria-busy={isAiLoading}
            className={[
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition",
              aiRemainingSeconds > 0 || isAiLoading
                ? "cursor-not-allowed bg-violet-100 text-violet-500"
                : "bg-violet-600 text-white hover:bg-violet-700"
            ].join(" ")}
          >
            {isAiLoading ? (
              <span
                aria-hidden="true"
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
              />
            ) : (
              <span aria-hidden="true">✨</span>
            )}
            <span>{aiButtonLabel}</span>
          </button>
        </div>

        {aiCardVisible ? (
          <div className="rounded-[24px] border border-violet-200 bg-violet-50 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-violet-950">
                  ✨ Learn more about {getAiLocationLabel(post)}
                </div>
                <div className="mt-1 text-xs text-violet-900/75">
                  Historical and cultural context generated for this location.
                </div>
              </div>

              {!isAiLoading && !aiError && hasAiContent && aiSource ? (
                <span className="shrink-0 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-200">
                  {aiSource === "cache" ? "Cached" : "Fresh"}
                </span>
              ) : null}
            </div>

            <div className="mt-4">
              {isAiLoading ? (
                <div className="rounded-[20px] border border-violet-200 bg-white/90 px-4 py-4">
                  <div className="h-4 animate-pulse rounded bg-violet-100" />
                  <div className="mt-2 h-4 animate-pulse rounded bg-violet-100" />
                  <div className="mt-2 h-4 w-4/5 animate-pulse rounded bg-violet-100" />
                </div>
              ) : aiError ? (
                <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                  <div className="font-semibold text-rose-800">Couldn&apos;t load extra information</div>
                  <div className="mt-1">{aiError}</div>
                </div>
              ) : hasAiContent ? (
                <div className="rounded-[20px] border border-violet-200 bg-white/90 px-4 py-4">
                  <p className="whitespace-pre-line text-sm leading-7 text-slate-700">{aiContent}</p>
                  <div className="mt-3 text-xs italic text-slate-500">Powered by Google Gemini</div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function getFiltersFromSearchParams(searchParams) {
  const q = String(searchParams.get("q") || "").trim();
  const rawSentiment = String(searchParams.get("sentiment") || "").trim().toLowerCase();
  const rawCategory = String(searchParams.get("category") || "").trim().toLowerCase();

  return {
    q,
    sentiment: ["positive", "neutral", "negative"].includes(rawSentiment) ? rawSentiment : "all",
    category:
      FEED_CATEGORY_OPTIONS.some((option) => option.key === rawCategory) && rawCategory !== "all"
        ? rawCategory
        : "all"
  };
}

export default function FeedPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setSelectedPlace } = useLocationContext();

  const [posts, setPosts] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: DEFAULT_PAGE_SIZE,
    hasMore: false,
    nextPage: null
  });

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState("");

  const [aiByPostId, setAiByPostId] = useState({});
  const [tickNowMs, setTickNowMs] = useState(Date.now());

  const feedAbortRef = useRef(null);
  const feedReqIdRef = useRef(0);
  const lastLoadAttemptRef = useRef({
    page: 1,
    append: false,
    filters: DEFAULT_FEED_FILTERS
  });

  const aiAbortByPostIdRef = useRef(new Map());
  const aiReqIdByPostIdRef = useRef(new Map());

  const effectiveFilters = useMemo(
    () => getFiltersFromSearchParams(searchParams),
    [searchParams]
  );

  useEffect(() => {
    return () => {
      if (feedAbortRef.current) {
        feedAbortRef.current.abort();
      }

      for (const controller of aiAbortByPostIdRef.current.values()) {
        controller.abort();
      }

      aiAbortByPostIdRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const hasActiveCooldown = Object.values(aiByPostId).some((item) => {
      const cooldownUntil = item?.cooldownUntil || 0;
      return cooldownUntil > Date.now();
    });

    if (!hasActiveCooldown) return;

    setTickNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      setTickNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [aiByPostId]);

  const loadFeedPage = useCallback(async (pageToLoad, append = false, filtersOverride = DEFAULT_FEED_FILTERS) => {
    if (feedAbortRef.current) {
      feedAbortRef.current.abort();
    }

    const controller = new AbortController();
    feedAbortRef.current = controller;

    const reqId = (feedReqIdRef.current += 1);
    const normalizedFilters = {
      q: String(filtersOverride?.q || "").trim(),
      sentiment: filtersOverride?.sentiment || "all",
      category:
        FEED_CATEGORY_OPTIONS.some((option) => option.key === filtersOverride?.category) &&
        filtersOverride?.category !== "all"
          ? filtersOverride.category
          : "all"
    };

    lastLoadAttemptRef.current = {
      page: pageToLoad,
      append,
      filters: normalizedFilters
    };

    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsInitialLoading(true);
    }

    setFeedError("");

    try {
      const result = await listFeedPosts(
        {
          page: pageToLoad,
          limit: DEFAULT_PAGE_SIZE,
          ...(normalizedFilters.q ? { q: normalizedFilters.q } : {}),
          ...(normalizedFilters.sentiment !== "all"
            ? { sentiment: normalizedFilters.sentiment }
            : {}),
          ...(normalizedFilters.category !== "all"
            ? { category: normalizedFilters.category }
            : {})
        },
        {
          signal: controller.signal,
          timeout: 15000
        }
      );

      if (reqId !== feedReqIdRef.current) return;

      const nextPosts = Array.isArray(result?.posts) ? result.posts : [];
      const nextPagination = result?.pagination ?? {
        page: pageToLoad,
        limit: DEFAULT_PAGE_SIZE,
        hasMore: false,
        nextPage: null
      };

      setPosts((prev) => (append ? mergeUniquePosts(prev, nextPosts) : nextPosts));
      setPagination(nextPagination);
    } catch (err) {
      if (
        err?.name === "CanceledError" ||
        err?.code === "ERR_CANCELED" ||
        err?.name === "AbortError"
      ) {
        return;
      }

      const status = err?.response?.status;
      const message = err?.response?.data?.message;

      if (status === 429) {
        setFeedError(message || "Too many requests. Please slow down.");
      } else if (status === 401) {
        setFeedError("Authentication required.");
      } else if (status === 400) {
        setFeedError(message || "The current feed filters are invalid. Please adjust them and try again.");
      } else {
        setFeedError("Could not load the feed right now. Please try again.");
      }
    } finally {
      if (reqId === feedReqIdRef.current) {
        if (append) {
          setIsLoadingMore(false);
        } else {
          setIsInitialLoading(false);
        }

        if (feedAbortRef.current === controller) {
          feedAbortRef.current = null;
        }
      }
    }
  }, []);

  useEffect(() => {
    setPosts([]);
    setPagination({
      page: 1,
      limit: DEFAULT_PAGE_SIZE,
      hasMore: false,
      nextPage: null
    });
    loadFeedPage(1, false, effectiveFilters);
  }, [effectiveFilters, loadFeedPage]);

  const requestLearnMore = useCallback(async (post) => {
    if (!post?.id) return;

    const postId = post.id;
    const payload = buildAiPayload(post);

    if (
      !payload.locationName ||
      !Number.isFinite(payload.latitude) ||
      !Number.isFinite(payload.longitude)
    ) {
      patchAiStateSetter(setAiByPostId, postId, {
        status: "error",
        error: "Location data is incomplete for this post.",
        content: "",
        source: "",
        cooldownUntil: 0
      });
      return;
    }

    const existingController = aiAbortByPostIdRef.current.get(postId);
    if (existingController) {
      existingController.abort();
    }

    const controller = new AbortController();
    aiAbortByPostIdRef.current.set(postId, controller);

    const nextReqId = (aiReqIdByPostIdRef.current.get(postId) || 0) + 1;
    aiReqIdByPostIdRef.current.set(postId, nextReqId);

    patchAiStateSetter(setAiByPostId, postId, {
      status: "loading",
      error: ""
    });

    try {
      const res = await api.post("/ai/learn-more", payload, {
        timeout: 15000,
        signal: controller.signal
      });

      if ((aiReqIdByPostIdRef.current.get(postId) || 0) !== nextReqId) return;

      const content = typeof res?.data?.content === "string" ? res.data.content.trim() : "";
      const source = typeof res?.data?.source === "string" ? res.data.source : "";

      if (!content || content.length < 20) {
        patchAiStateSetter(setAiByPostId, postId, {
          status: "error",
          error: "No additional information available for this location.",
          content: "",
          source: "",
          cooldownUntil: 0
        });
        return;
      }

      patchAiStateSetter(setAiByPostId, postId, {
        status: "ready",
        content,
        error: "",
        source,
        cooldownUntil: 0
      });
    } catch (err) {
      if (
        err?.name === "CanceledError" ||
        err?.code === "ERR_CANCELED" ||
        err?.name === "AbortError"
      ) {
        return;
      }

      if ((aiReqIdByPostIdRef.current.get(postId) || 0) !== nextReqId) return;

      const status = err?.response?.status;
      const message = err?.response?.data?.message;

      if (status === 429) {
        patchAiStateSetter(setAiByPostId, postId, {
          status: "error",
          error: message || "Too many requests. Please try again in a moment.",
          cooldownUntil: Date.now() + AI_COOLDOWN_MS
        });
      } else if (!err?.response) {
        patchAiStateSetter(setAiByPostId, postId, {
          status: "error",
          error: "Failed to load information. Please try again.",
          content: "",
          source: "",
          cooldownUntil: 0
        });
      } else {
        patchAiStateSetter(setAiByPostId, postId, {
          status: "error",
          error: "Unable to load information at this time.",
          content: "",
          source: "",
          cooldownUntil: 0
        });
      }
    } finally {
      const currentController = aiAbortByPostIdRef.current.get(postId);
      if (currentController === controller) {
        aiAbortByPostIdRef.current.delete(postId);
      }
    }
  }, []);

  const handleOpenOnMap = useCallback(
    (post) => {
      const selection = buildMapSelection(post);
      if (!selection) return;

      setSelectedPlace(selection, "search");
      navigate("/map");
    },
    [navigate, setSelectedPlace]
  );

  const aiRemainingByPostId = useMemo(() => {
    const out = {};

    for (const [postId, state] of Object.entries(aiByPostId)) {
      const cooldownUntil = state?.cooldownUntil || 0;
      if (!cooldownUntil) {
        out[postId] = 0;
        continue;
      }

      const remaining = Math.ceil((cooldownUntil - tickNowMs) / 1000);
      out[postId] = Math.max(0, remaining);
    }

    return out;
  }, [aiByPostId, tickNowMs]);

  const handleSentimentChange = useCallback(
    (nextSentiment) => {
      const params = new URLSearchParams(searchParams);
      const normalizedSentiment = String(nextSentiment || "all").toLowerCase();

      if (normalizedSentiment === "all") {
        params.delete("sentiment");
      } else {
        params.set("sentiment", normalizedSentiment);
      }

      setSearchParams(params, { replace: false });
    },
    [searchParams, setSearchParams]
  );

  const handleClearSentiment = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete("sentiment");
    setSearchParams(params, { replace: false });
  }, [searchParams, setSearchParams]);

  const handleCategoryChange = useCallback(
    (nextCategory) => {
      const params = new URLSearchParams(searchParams);
      const normalizedCategory = String(nextCategory || "all").trim().toLowerCase();

      if (!FEED_CATEGORY_OPTIONS.some((option) => option.key === normalizedCategory)) {
        return;
      }

      if (normalizedCategory === "all") {
        params.delete("category");
      } else {
        params.set("category", normalizedCategory);
      }

      setSearchParams(params, { replace: false });
    },
    [searchParams, setSearchParams]
  );

  const handleClearCategory = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete("category");
    setSearchParams(params, { replace: false });
  }, [searchParams, setSearchParams]);

  const handleClearSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete("q");
    setSearchParams(params, { replace: false });
  }, [searchParams, setSearchParams]);

  const showBlockingError = !isInitialLoading && Boolean(feedError) && posts.length === 0;

  let mainContent = null;

  if (isInitialLoading) {
    mainContent = (
      <div className="space-y-5">
        <FeedSkeletonCard />
        <FeedSkeletonCard />
      </div>
    );
  } else if (showBlockingError) {
    mainContent = null;
  } else if (posts.length === 0) {
    mainContent = <EmptyFeedState filters={effectiveFilters} />;
  } else {
    mainContent = (
      <div className="space-y-5">
        {posts.map((post) => (
          <FeedPostCard
            key={post.id}
            post={post}
            aiState={aiByPostId[post.id] || getDefaultAiState()}
            aiRemainingSeconds={aiRemainingByPostId[post.id] || 0}
            onRequestLearnMore={requestLearnMore}
            onOpenOnMap={handleOpenOnMap}
          />
        ))}
      </div>
    );
  }

  const retryLastRequest = () => {
    const { page, append, filters } = lastLoadAttemptRef.current;
    loadFeedPage(page, append, filters);
  };

  return (
    <div className="min-h-full bg-slate-50/95">
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <div className="space-y-5">
          <FeedHero />

          <FeedFiltersBar
            filters={effectiveFilters}
            isBusy={isInitialLoading || isLoadingMore}
            onSentimentChange={handleSentimentChange}
            onCategoryChange={handleCategoryChange}
            onClearSentiment={handleClearSentiment}
            onClearCategory={handleClearCategory}
            onClearSearch={handleClearSearch}
          />

          {feedError ? (
            <section className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
              <div className="font-semibold text-rose-800">Couldn&apos;t load the feed</div>
              <div className="mt-1">{feedError}</div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={retryLastRequest}
                  className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                >
                  Retry
                </button>
              </div>
            </section>
          ) : null}

          {mainContent}

          {!isInitialLoading && posts.length > 0 && pagination.hasMore ? (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => {
                  if (isLoadingMore || isInitialLoading || !pagination.nextPage) return;
                  loadFeedPage(pagination.nextPage, true, effectiveFilters);
                }}
                disabled={isLoadingMore || isInitialLoading || !pagination.nextPage}
                className={[
                  "inline-flex min-h-11 items-center justify-center rounded-2xl px-5 py-2.5 text-sm font-semibold transition",
                  isLoadingMore || isInitialLoading || !pagination.nextPage
                    ? "cursor-not-allowed bg-slate-200 text-slate-500"
                    : "bg-slate-900 text-white hover:bg-slate-800"
                ].join(" ")}
              >
                {isLoadingMore ? "Loading more..." : "Load more posts"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}