//src/pages/FeedPage.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/axios.js";
import { listFeedPosts } from "../api/posts.js";
import { useLocationContext } from "../hooks/useLocationContext.js";
import { getSentimentUi } from "../utils/sentimentUi.js";
import { makeCloudinaryOptimizer } from "../utils/cloudinaryImage.js";
import {
  getPlaceCategoryUi,
  isKnownPlaceCategory,
  PLACE_CATEGORY_FILTER_OPTIONS
} from "../utils/placeCategoryUi.js";

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

const FEED_CATEGORY_OPTIONS = PLACE_CATEGORY_FILTER_OPTIONS;

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium"
  }).format(date);
}

function formatFeedPostDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 0) {
    return formatDate(value);
  }

  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  const diffMinutes = Math.floor(diffMs / minuteMs);
  const diffHours = Math.floor(diffMs / hourMs);
  const diffDays = Math.floor(diffMs / dayMs);

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }

  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  if (diffDays <= 7) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  }

  return formatDate(value);
}

const optimizeCloudinaryUrl = makeCloudinaryOptimizer(
  {
    thumb: "c_fill,w_700,h_520,g_auto,f_auto,q_auto",
    card: "c_fill,w_1400,h_900,g_auto,f_auto,q_auto",
    single: "c_limit,w_1200,f_auto,q_auto"
  },
  "card"
);


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

function hasValidCoordinatePair(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
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

const DEFAULT_AI_STATE_OBJECT = Object.freeze({
  status: "idle",
  content: "",
  error: "",
  source: "",
  cooldownUntil: 0
});

function getDefaultAiState() {
  return { ...DEFAULT_AI_STATE_OBJECT };
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

  if (!hasValidCoordinatePair(lat, lng)) {
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
      decoding="async"
      onError={() => setHasError(true)}
    />
  );
}

function FeedFilterPill({ label, active, tone = "dark", disabled = false, onClick }) {
  const inactiveToneClass =
    tone === "teal"
      ? "border-slate-200 bg-white text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.045)] hover:-translate-y-1 hover:scale-[1.015] hover:border-cyan-400 hover:text-slate-800 hover:shadow-[0_24px_58px_rgba(6,182,212,0.30),0_0_46px_rgba(45,212,191,0.28)] focus:-translate-y-1 focus:scale-[1.015] focus:border-cyan-400 focus:text-slate-800 focus:shadow-[0_24px_58px_rgba(6,182,212,0.32),0_0_52px_rgba(45,212,191,0.32)] focus-visible:-translate-y-1 focus-visible:scale-[1.015] focus-visible:border-cyan-400 focus-visible:text-slate-800 focus-visible:shadow-[0_24px_58px_rgba(6,182,212,0.34),0_0_56px_rgba(45,212,191,0.36)]"
      : "border-slate-300 bg-white text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.045)] hover:-translate-y-1 hover:scale-[1.015] hover:border-slate-400 hover:text-slate-800 hover:shadow-[0_24px_58px_rgba(15,23,42,0.20),0_0_44px_rgba(148,163,184,0.30)] focus:-translate-y-1 focus:scale-[1.015] focus:border-slate-400 focus:text-slate-800 focus:shadow-[0_24px_58px_rgba(15,23,42,0.22),0_0_48px_rgba(148,163,184,0.34)] focus-visible:-translate-y-1 focus-visible:scale-[1.015] focus-visible:border-slate-400 focus-visible:text-slate-800 focus-visible:shadow-[0_24px_58px_rgba(15,23,42,0.24),0_0_52px_rgba(148,163,184,0.38)]";

  const activeToneClass =
    tone === "teal"
      ? "border-transparent bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 text-white shadow-[0_22px_52px_rgba(20,184,166,0.34),0_0_42px_rgba(45,212,191,0.26)] hover:-translate-y-1 hover:scale-[1.015] hover:shadow-[0_28px_68px_rgba(20,184,166,0.42),0_0_58px_rgba(45,212,191,0.34)] focus:-translate-y-1 focus:scale-[1.015] focus:shadow-[0_28px_68px_rgba(20,184,166,0.44),0_0_62px_rgba(45,212,191,0.38)] focus-visible:-translate-y-1 focus-visible:scale-[1.015]"
      : "border-transparent bg-[#162238] text-white shadow-[0_22px_52px_rgba(15,23,42,0.28),0_0_36px_rgba(15,23,42,0.16)] hover:-translate-y-1 hover:scale-[1.015] hover:shadow-[0_28px_68px_rgba(15,23,42,0.38),0_0_48px_rgba(15,23,42,0.22)] focus:-translate-y-1 focus:scale-[1.015] focus:shadow-[0_28px_68px_rgba(15,23,42,0.40),0_0_52px_rgba(15,23,42,0.24)] focus-visible:-translate-y-1 focus-visible:scale-[1.015]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex min-h-[54px] items-center justify-center rounded-[30px] border-[3px] px-8 py-3 text-[16px] font-black leading-none tracking-normal transition-all duration-200 outline-none focus:outline-none focus-visible:ring-0 active:translate-y-0 active:scale-[0.99]",
        active ? activeToneClass : inactiveToneClass,
        disabled
          ? "cursor-not-allowed opacity-60 hover:translate-y-0 hover:scale-100 hover:shadow-[0_8px_20px_rgba(15,23,42,0.045)] focus:translate-y-0 focus:scale-100 focus-visible:translate-y-0 focus-visible:scale-100"
          : ""
      ].join(" ")}
    >
      <span className="font-black">{label}</span>
    </button>
  );
}

function FeedFilterSectionTitle({ children, tone = "dark" }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span
        aria-hidden="true"
        className={[
          "h-7 w-1.5 rounded-full",
          tone === "teal" ? "bg-teal-500" : "bg-[#162238]"
        ].join(" ")}
      />
      <h2 className="text-[15px] font-extrabold tracking-[0.02em] text-slate-950">
        {children}
      </h2>
    </div>
  );
}

function FeedIntroPanel({
  filters,
  isBusy,
  onSentimentChange,
  onCategoryChange
}) {
  const hasFilters = hasActiveFeedFilters(filters);

  return (
    <section className="rounded-[30px] border border-[#d9efec] bg-[#f3fbfa] px-5 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] sm:px-7 lg:px-9 lg:py-7">
      <div className="max-w-5xl">
        <h1 className="text-[42px] font-extrabold leading-[0.95] tracking-tight text-slate-950 sm:text-[52px] lg:text-[60px]">
          Discover{" "}
          <span className="relative inline-block bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 bg-clip-text pr-1 text-transparent">
            Stories
            <span
              aria-hidden="true"
              className="absolute -bottom-1 left-0 h-1.5 w-full rounded-full bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500"
            />
          </span>
        </h1>

        <p className="mt-4 max-w-3xl text-base font-semibold leading-7 text-slate-500 sm:text-[17px]">
          Explore authentic travel experiences from adventurers worldwide
        </p>

        <div className="mt-7 space-y-6">
          <div>
            <FeedFilterSectionTitle tone="dark">Sentiment</FeedFilterSectionTitle>

            <div className="flex flex-wrap gap-3">
              {FEED_SENTIMENT_OPTIONS.map((option) => (
                <FeedFilterPill
                  key={option.key}
                  label={option.label}
                  active={filters.sentiment === option.key}
                  tone="dark"
                  disabled={isBusy}
                  onClick={() => onSentimentChange(option.key)}
                />
              ))}
            </div>
          </div>

          <div>
            <FeedFilterSectionTitle tone="teal">Destinations</FeedFilterSectionTitle>

            <div className="flex flex-wrap gap-3">
              {FEED_CATEGORY_OPTIONS.map((option) => (
                <FeedFilterPill
                  key={option.key}
                  label={option.label}
                  active={filters.category === option.key}
                  tone="teal"
                  disabled={isBusy}
                  onClick={() => onCategoryChange(option.key)}
                />
              ))}
            </div>
          </div>
        </div>

        {hasFilters ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {filters.q ? (
              <span className="inline-flex items-center rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                Search: {filters.q}
              </span>
            ) : null}

            {filters.sentiment !== "all" ? (
              <span className="inline-flex items-center rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                Sentiment: {filters.sentiment}
              </span>
            ) : null}

            {filters.category !== "all" ? (
              <span className="inline-flex items-center rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                Category: {getPlaceCategoryUi(filters.category).label}
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

const FeedImageGallery = React.memo(function FeedImageGallery({ post }) {
  const images = normalizePreviewImages(post);
  const totalImages = Number.isFinite(Number(post?.imageCount))
    ? Number(post.imageCount)
    : images.length;

  if (images.length === 0) {
    return (
      <div className="mt-5 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
        {totalImages > 0
          ? `${totalImages} image${totalImages === 1 ? "" : "s"} attached, but no preview is available.`
          : "No preview images for this post."}
      </div>
    );
  }

  if (images.length === 1) {
    return (
      <div className="mt-5 rounded-[28px] border border-cyan-100/80 bg-[#eaf9f7] px-3 py-3 shadow-[0_14px_30px_rgba(8,145,178,0.10),0_0_24px_rgba(16,185,129,0.08)]">
        <div className="mx-auto flex max-w-[920px] items-center justify-center">
          <SafeFeedImage
            src={optimizeCloudinaryUrl(images[0], "single")}
            alt={post.title}
            className="max-h-[390px] w-auto max-w-full rounded-[24px] object-contain shadow-[0_12px_28px_rgba(15,23,42,0.10)]"
          />
        </div>
      </div>
    );
  }

  if (images.length === 2) {
    const remaining = Math.max(0, totalImages - 2);

    return (
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50">
          <SafeFeedImage
            src={optimizeCloudinaryUrl(images[0], "card")}
            alt={`${post.title} preview 1`}
            className="h-[300px] w-full object-cover sm:h-[320px]"
          />
        </div>

        <div className="relative overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50">
          <SafeFeedImage
            src={optimizeCloudinaryUrl(images[1], "card")}
            alt={`${post.title} preview 2`}
            className="h-[300px] w-full object-cover sm:h-[320px]"
          />

          {remaining > 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/45">
              <span className="rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-slate-900">
                +{remaining} more
              </span>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const first = images[0];
  const second = images[1];
  const third = images[2];
  const remaining = Math.max(0, totalImages - 3);

  return (
    <div className="mt-5 grid gap-3 lg:grid-cols-[1.14fr_0.86fr]">
      <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50">
        <SafeFeedImage
          src={optimizeCloudinaryUrl(first, "card")}
          alt={`${post.title} preview 1`}
          className="h-[300px] w-full object-cover sm:h-[320px]"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50">
          <SafeFeedImage
            src={optimizeCloudinaryUrl(second, "thumb")}
            alt={`${post.title} preview 2`}
            className="h-[144px] w-full object-cover sm:h-[154px]"
          />
        </div>

        <div className="relative overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50">
          <SafeFeedImage
            src={optimizeCloudinaryUrl(third, "thumb")}
            alt={`${post.title} preview 3`}
            className="h-[144px] w-full object-cover sm:h-[154px]"
          />

          {remaining > 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/45">
              <span className="rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-slate-900">
                +{remaining} more
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

function getFeedAuthorInitials(post) {
  const source = String(post?.username || post?.email || "T").trim();

  if (!source) return "T";

  const parts = source.replace(/[@._-]+/g, " ").split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

function FeedLocationIcon({ className = "h-5 w-5" }) {
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

function getFeedSentimentPillClass(sentiment) {
  if (sentiment === "positive") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (sentiment === "negative") {
    return "border-rose-200 bg-rose-50 text-rose-700 ring-rose-200";
  }

  return "border-slate-200 bg-slate-50 text-slate-700 ring-slate-200";
}

function getFeedPrivacyPillClass(privacy) {
  if (privacy === "public") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  return "border-slate-200 bg-slate-50 text-slate-700 ring-slate-200";
}

function FeedCompactBadge({ children, className = "" }) {
  return (
    <span
      className={[
        "inline-flex min-h-[34px] items-center gap-2 rounded-full border px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] shadow-[0_8px_18px_rgba(15,23,42,0.04)] ring-1",
        className
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function shouldSkipCardNavigation(event) {
  const target = event?.target;

  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      "a, button, input, textarea, select, [role='button'], [data-no-card-nav='true']"
    )
  );
}

const FeedPostCard = React.memo(function FeedPostCard({
  post,
  aiState,
  aiRemainingSeconds,
  onRequestLearnMore,
  onOpenOnMap,
  onOpenPost
}) {
  const sentimentUi = getSentimentUi(post.sentiment, post.sentimentScore, "feed");
  const privacyUi = getPrivacyUi(post.privacy);
  const placeCategoryUi = getPlaceCategoryUi(post.placeCategory);
  const username = String(post?.username || "Traveler").trim() || "Traveler";
  const profileUrl = post?.username ? `/users/${encodeURIComponent(post.username)}` : null;
  const authorInitials = getFeedAuthorInitials(post);

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

  const relativeCreatedAt = formatFeedPostDate(post.createdAt);
  const locationLabel =
    dedupeParts([post.locationName, post.city, post.country]).join(", ") || "Open on map";


  return (
    <article
      role="link"
      tabIndex={0}
      aria-label={`Open post: ${post.title}`}
      onClick={(event) => {
        if (shouldSkipCardNavigation(event)) return;
        onOpenPost?.(post);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenPost?.(post);
        }
      }}
      className="group cursor-pointer overflow-hidden rounded-[30px] border border-cyan-100/80 bg-white p-4 shadow-[0_16px_38px_rgba(8,145,178,0.10),0_0_30px_rgba(16,185,129,0.08)] outline-none transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-100 hover:shadow-[0_24px_64px_rgba(8,145,178,0.20),0_0_48px_rgba(16,185,129,0.16)] focus-visible:-translate-y-0.5 focus-visible:border-cyan-200 focus-visible:ring-4 focus-visible:ring-cyan-200/55 focus-visible:shadow-[0_24px_64px_rgba(8,145,178,0.24),0_0_52px_rgba(16,185,129,0.20)] active:translate-y-0 lg:p-5"
    >
      <div className="flex flex-col">
        <div className="flex flex-wrap items-center gap-2.5">
          <FeedCompactBadge className={getFeedSentimentPillClass(sentimentUi.sentiment)}>
            <span aria-hidden="true">{sentimentUi.emoji}</span>
            <span>{String(sentimentUi.label || "").toUpperCase()}</span>
          </FeedCompactBadge>

          <FeedCompactBadge className={getFeedPrivacyPillClass(post.privacy)}>
            <span aria-hidden="true">{privacyUi.icon}</span>
            <span>{privacyUi.label.toUpperCase()}</span>
          </FeedCompactBadge>

          <FeedCompactBadge className={placeCategoryUi.badge}>
            <span aria-hidden="true">{placeCategoryUi.icon}</span>
            <span>{placeCategoryUi.label.toUpperCase()}</span>
          </FeedCompactBadge>
        </div>

        <header className="mt-5 rounded-[24px] border border-slate-200/80 bg-white/85 px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <div className="flex items-center gap-4">
            <div className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[18px] bg-slate-900 text-base font-extrabold text-white shadow-[0_14px_28px_rgba(8,145,178,0.18),0_0_24px_rgba(16,185,129,0.14)] ring-4 ring-cyan-50">
              {authorInitials}
            </div>

            <div className="min-w-0">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-400">
                Written by
              </div>

              {profileUrl ? (
                <Link
                  to={profileUrl}
                  className="mt-0.5 block w-fit break-words text-[18px] font-extrabold tracking-tight text-slate-950 transition hover:text-slate-700 focus:outline-none focus-visible:rounded-xl focus-visible:ring-4 focus-visible:ring-cyan-200/55"
                >
                  {username}
                </Link>
              ) : (
                <div className="mt-0.5 break-words text-[18px] font-extrabold tracking-tight text-slate-950">
                  {username}
                </div>
              )}

              <div className="mt-0.5 text-sm font-semibold text-slate-500">
                {relativeCreatedAt}
              </div>
            </div>
          </div>
        </header>

        <button
          type="button"
          onClick={() => onOpenOnMap(post)}
          className="mt-5 inline-flex w-fit max-w-full min-h-[44px] items-center gap-3 rounded-full border border-cyan-200 bg-cyan-50/95 px-5 py-2.5 text-left text-sm font-extrabold text-teal-700 shadow-[0_12px_28px_rgba(8,145,178,0.16)] ring-1 ring-cyan-100 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50 hover:text-teal-800 hover:shadow-[0_16px_34px_rgba(8,145,178,0.20),0_0_28px_rgba(16,185,129,0.14)] focus:outline-none focus-visible:-translate-y-0.5 focus-visible:border-cyan-300 focus-visible:bg-cyan-50 focus-visible:text-teal-800 focus-visible:ring-4 focus-visible:ring-cyan-200/55 active:translate-y-0"
        >
          <FeedLocationIcon className="h-5 w-5 shrink-0 text-cyan-600" />
          <span className="min-w-0 truncate">{locationLabel}</span>
        </button>

        <section className="relative mt-5 overflow-hidden rounded-[26px] border border-cyan-100/80 bg-white/90 px-5 py-5 shadow-[0_14px_30px_rgba(8,145,178,0.10),0_0_24px_rgba(16,185,129,0.06)]">
          <div className="absolute left-0 top-2 bottom-2 w-1.5 rounded-full bg-gradient-to-b from-cyan-500 to-emerald-500" />
          <div className="absolute right-4 bottom-2 text-5xl font-black leading-none text-cyan-100/80">
            ”
          </div>

          <p className="relative z-10 pr-8 pl-4 whitespace-pre-line text-[16px] font-semibold italic leading-8 text-slate-700 lg:text-[17px]">
            {post.contentPreview || "No preview available."}
          </p>
        </section>

        <FeedImageGallery post={post} />

        <div className="mt-7 grid gap-3">
          <button
            type="button"
            onClick={() => onRequestLearnMore(post)}
            disabled={aiRemainingSeconds > 0 || isAiLoading}
            aria-busy={isAiLoading}
            className={[
              "inline-flex min-h-[56px] items-center justify-center gap-2 rounded-[20px] px-5 py-3 text-sm font-extrabold transition-all duration-300 focus:outline-none active:translate-y-0",
              aiRemainingSeconds > 0 || isAiLoading
                ? "cursor-not-allowed bg-violet-100 text-violet-500 shadow-none"
                : "bg-violet-600 text-white shadow-[0_16px_34px_rgba(124,58,237,0.28),0_0_30px_rgba(139,92,246,0.16)] hover:-translate-y-0.5 hover:bg-violet-700 hover:shadow-[0_24px_54px_rgba(124,58,237,0.42),0_0_46px_rgba(139,92,246,0.28)] focus-visible:-translate-y-0.5 focus-visible:bg-violet-700 focus-visible:ring-4 focus-visible:ring-violet-200/70 focus-visible:shadow-[0_26px_62px_rgba(124,58,237,0.48),0_0_54px_rgba(139,92,246,0.34)]"
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
          <div className="mt-5 rounded-[24px] border border-violet-200 bg-violet-50 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-violet-950">
                  ✨ Learn more about {post?.locationName || "this location"}
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
                  <div className="font-semibold text-rose-800">
                    Couldn&apos;t load extra information
                  </div>
                  <div className="mt-1">{aiError}</div>
                </div>
              ) : hasAiContent ? (
                <div className="rounded-[20px] border border-violet-200 bg-white/90 px-4 py-4">
                  <p className="whitespace-pre-line text-sm leading-7 text-slate-700">
                    {aiContent}
                  </p>
                  <div className="mt-3 text-xs italic text-slate-500">
                    Powered by Google Gemini
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
});

function getFiltersFromSearchParams(searchParams) {
  const q = String(searchParams.get("q") || "").trim();
  const rawSentiment = String(searchParams.get("sentiment") || "").trim().toLowerCase();
  const rawCategory = String(searchParams.get("category") || "").trim().toLowerCase();

  return {
    q,
    sentiment: ["positive", "neutral", "negative"].includes(rawSentiment) ? rawSentiment : "all",
    category: rawCategory !== "all" && isKnownPlaceCategory(rawCategory) ? rawCategory : "all"
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

  if (!hasActiveCooldown) return undefined;

  setTickNowMs(Date.now());

  const intervalId = window.setInterval(() => {
    const now = Date.now();

    setTickNowMs(now);

    const stillActive = Object.values(aiByPostId).some((item) => {
      const cooldownUntil = item?.cooldownUntil || 0;
      return cooldownUntil > now;
    });

    if (!stillActive) {
      window.clearInterval(intervalId);
    }
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

      const nextPosts = Array.isArray(result?.posts)
      ? result.posts.filter((item) => item && item.id != null)
      : [];
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
      
      if (reqId !== feedReqIdRef.current) return;

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
      !hasValidCoordinatePair(payload.latitude, payload.longitude)
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

  const handleOpenPost = useCallback(
    (selectedPost) => {
      if (!selectedPost?.id) return;
      navigate(`/posts/${selectedPost.id}`);
    },
    [navigate]
  );
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
            aiState={aiByPostId[post.id] || DEFAULT_AI_STATE_OBJECT}
            aiRemainingSeconds={aiRemainingByPostId[post.id] || 0}
            onRequestLearnMore={requestLearnMore}
            onOpenOnMap={handleOpenOnMap}
            onOpenPost={handleOpenPost}
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
  <div className="min-h-full bg-[#eff7f6]">
    <div className="w-full px-4 py-4 sm:px-6 lg:px-10 lg:py-6">
      <div className="mx-auto max-w-[1120px] space-y-5">
        <FeedIntroPanel
          filters={effectiveFilters}
          isBusy={isInitialLoading || isLoadingMore}
          onSentimentChange={handleSentimentChange}
          onCategoryChange={handleCategoryChange}
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