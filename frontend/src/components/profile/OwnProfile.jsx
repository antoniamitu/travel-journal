// frontend/src/components/profile/OwnProfile.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatSentimentScore, getSentimentUi } from "../../utils/sentimentUi.js";
import { getPlaceCategoryUi } from "../../utils/placeCategoryUi.js";
import { makeCloudinaryOptimizer } from "../../utils/cloudinaryImage.js";
import ProfilePostsMap from "./ProfilePostsMap.jsx";
import { formatMemberSince, formatPostDate } from "../../utils/dateFormat.js";
import {
  getAvatarInitials,
  getPostLocation,
  getPreviewImage,
  hasValidPostCoordinates
} from "../../utils/postDisplay.js";

const EMPTY_STATS = {
  totalPosts: 0,
  publicPosts: 0,
  privatePosts: 0,
  averageSentimentScore: null,
  sentimentCounts: {
    positive: 0,
    neutral: 0,
    negative: 0
  },
  countriesVisited: 0,
  citiesVisited: 0
};

function asSafeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeProfileStats(stats) {
  const source = stats && typeof stats === "object" ? stats : {};
  const sentimentCounts =
    source.sentimentCounts && typeof source.sentimentCounts === "object"
      ? source.sentimentCounts
      : {};

  return {
    totalPosts: asSafeNumber(source.totalPosts, EMPTY_STATS.totalPosts),
    publicPosts: asSafeNumber(source.publicPosts, EMPTY_STATS.publicPosts),
    privatePosts: asSafeNumber(source.privatePosts, EMPTY_STATS.privatePosts),
    averageSentimentScore:
      source.averageSentimentScore == null ? null : asSafeNumber(source.averageSentimentScore, null),
    sentimentCounts: {
      positive: asSafeNumber(sentimentCounts.positive, 0),
      neutral: asSafeNumber(sentimentCounts.neutral, 0),
      negative: asSafeNumber(sentimentCounts.negative, 0)
    },
    countriesVisited: asSafeNumber(source.countriesVisited, EMPTY_STATS.countriesVisited),
    citiesVisited: asSafeNumber(source.citiesVisited, EMPTY_STATS.citiesVisited)
  };
}

const optimizeCloudinaryUrl = makeCloudinaryOptimizer(
  {
    thumb: "c_fill,w_900,h_620,g_auto,f_auto,q_auto",
    card: "c_fill,w_1400,h_960,g_auto,f_auto,q_auto"
  },
  "card"
);


function ProfileLocationIcon({ className = "h-5 w-5" }) {
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


function SettingsDropdown({ onDeleteRequest, deleteDisabled = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function onMouseDown(e) {
      if (!rootRef.current || rootRef.current.contains(e.target)) {
        return;
      }

      setOpen(false);
    }

    function onKeyDown(e) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function handleDeleteClick() {
    if (deleteDisabled) return;

    setOpen(false);
    onDeleteRequest?.();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/12 px-4 py-2.5 text-sm font-bold text-white shadow-sm backdrop-blur transition hover:bg-white/18 focus:outline-none focus:ring-4 focus:ring-white/25"
      >
        <span aria-hidden="true">⚙️</span>
        <span>Settings</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-3 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-slate-900 shadow-2xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleDeleteClick}
            disabled={deleteDisabled}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span aria-hidden="true">🗑️</span>
            <span>Delete account</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ProfileHero({ user, stats, onDeleteRequest, deleteDisabled }) {
  const initials = getAvatarInitials(user);
  const avgSentimentLabel = formatSentimentScore(stats.averageSentimentScore);

  return (
    <section className="overflow-hidden rounded-[34px] bg-gradient-to-r from-violet-400 to-purple-900 shadow-[0_22px_60px_rgba(88,28,135,0.24)]">
      <div className="relative px-6 py-8 text-white lg:px-9 lg:py-10">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/20 blur-3xl" />
        <div className="absolute -bottom-28 right-12 h-72 w-72 rounded-full bg-cyan-200/20 blur-3xl" />

        <div className="relative flex flex-col gap-7 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-4 border-white/80 bg-white/20 text-3xl font-extrabold shadow-sm backdrop-blur">
              {initials}
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-4xl font-extrabold tracking-tight lg:text-5xl">
                {user?.username || "Your Profile"}
              </h1>

              <div className="mt-3 flex flex-col gap-1 text-sm text-white/92 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 lg:text-base">
                <span className="break-all">{user?.email || "—"}</span>
                <span className="hidden sm:inline">•</span>
                <span>{formatMemberSince(user?.createdAt)}</span>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3 text-sm font-bold text-white/95 lg:text-base">
                <span className="rounded-full bg-white/16 px-3.5 py-1.5 backdrop-blur">
                  🌍 {stats.countriesVisited} {stats.countriesVisited === 1 ? "country" : "countries"}
                </span>
                <span className="rounded-full bg-white/16 px-3.5 py-1.5 backdrop-blur">
                  📝 {stats.totalPosts} {stats.totalPosts === 1 ? "memory" : "memories"}
                </span>
                <span className="rounded-full bg-white/16 px-3.5 py-1.5 backdrop-blur">
                  🏙️ {stats.citiesVisited} {stats.citiesVisited === 1 ? "city" : "cities"}
                </span>
                <span className="rounded-full bg-white/16 px-3.5 py-1.5 backdrop-blur">
                  😊 Avg. sentiment {avgSentimentLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 justify-start lg:justify-end">
            <SettingsDropdown
              onDeleteRequest={onDeleteRequest}
              deleteDisabled={deleteDisabled}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function ProfileTabs({ activeTab, onChange, postsCount, pinsCount }) {
  const tabs = [
    {
      key: "posts",
      label: "Posts",
      icon: "▦",
      count: postsCount
    },
    {
      key: "map",
      label: "Map",
      icon: "🗺️",
      count: pinsCount
    }
  ];

  return (
    <div className="flex justify-center">
      <div
        role="tablist"
        aria-label="Profile sections"
        className="inline-flex flex-wrap justify-center gap-3 rounded-[28px] bg-white p-2 shadow-sm ring-1 ring-slate-200"
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.key)}
              className={[
                "inline-flex min-h-14 items-center justify-center gap-2 rounded-[22px] px-6 py-3 text-sm font-extrabold transition sm:min-w-40 sm:text-base",
                active
                  ? "bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 text-white shadow-[0_14px_34px_rgba(8,145,178,0.26)]"
                  : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              ].join(" ")}
            >
              <span aria-hidden="true">{tab.icon}</span>
              <span>{tab.label}</span>
              <span
                className={[
                  "rounded-full px-2 py-0.5 text-xs",
                  active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                ].join(" ")}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProfilePostCard({ post }) {
  const imageUrl = getPreviewImage(post);
  const sentimentUi = getSentimentUi(post?.sentiment, post?.sentimentScore, "profile");
  const placeCategoryUi = getPlaceCategoryUi(post?.placeCategory);
  const location = getPostLocation(post);

  return (
    <Link
      to={`/posts/${post.id}`}
      className="group overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-cyan-100"
    >
      <div className="relative h-64 overflow-hidden bg-slate-100">
        {imageUrl ? (
          <img
            src={optimizeCloudinaryUrl(imageUrl, "thumb")}
            alt={post?.title || "Post preview"}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-500">
            No preview image
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/45 via-slate-950/8 to-transparent" />

        <span className="absolute bottom-4 left-4 z-20 inline-flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-full bg-white px-4 py-2.5 text-left text-sm font-extrabold text-slate-950 shadow-xl">
          <ProfileLocationIcon className="h-5 w-5 shrink-0 text-cyan-600" />
          <span className="min-w-0 truncate">{location}</span>
        </span>

        <span className="absolute right-4 top-4 z-20 rounded-full bg-white/92 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm">
          {post?.privacy === "private" ? "🔒 Private" : "🌍 Public"}
        </span>
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${sentimentUi.shell}`}
          >
            {sentimentUi.emoji} {sentimentUi.label}
          </span>

          <span
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${placeCategoryUi.shell}`}
          >
            <span aria-hidden="true">{placeCategoryUi.icon}</span>
            <span>{placeCategoryUi.label}</span>
          </span>

          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {formatPostDate(post?.createdAt)}
          </span>
        </div>

        <h3 className="mt-4 line-clamp-2 text-xl font-bold tracking-tight text-slate-950">
          {post?.title || "Untitled post"}
        </h3>

        <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
          {post?.contentPreview || "Open this memory to see the full story."}
        </p>
      </div>
    </Link>
  );
}

function EmptyPostsState() {
  return (
    <div className="rounded-[32px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-2xl">
        📝
      </div>

      <h3 className="mt-4 text-2xl font-semibold text-slate-900">No posts yet</h3>

      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">
        You haven&apos;t created any travel memories yet. Start with your first post and it will
        appear here.
      </p>

      <div className="mt-6">
        <Link
          to="/posts/new"
          className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Create Your First Post
        </Link>
      </div>
    </div>
  );
}

export default function OwnProfile({
  user,
  stats,
  posts,
  recentPosts,
  mapPosts,
  onDeleteRequest,
  deleteDisabled = false
}) {
  const [activeTab, setActiveTab] = useState("posts");

  const safeStats = useMemo(() => normalizeProfileStats(stats), [stats]);

  const safeRecentPosts = useMemo(() => {
    return Array.isArray(recentPosts) ? recentPosts.filter((post) => post?.id != null) : [];
  }, [recentPosts]);

  const safePosts = useMemo(() => {
    return Array.isArray(posts)
      ? posts.filter((post) => post?.id != null)
      : safeRecentPosts;
  }, [posts, safeRecentPosts]);

  const safeMapPosts = useMemo(() => {
    const source = Array.isArray(mapPosts)
      ? mapPosts
      : safePosts.filter(hasValidPostCoordinates);

    return source.filter((post) => post?.id != null && hasValidPostCoordinates(post));
  }, [mapPosts, safePosts]);

  return (
    <div className="min-h-full bg-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-5 lg:px-6 lg:py-6">
        <ProfileHero
          user={user}
          stats={safeStats}
          onDeleteRequest={onDeleteRequest}
          deleteDisabled={deleteDisabled}
        />

        <div className="mt-8">
          <ProfileTabs
            activeTab={activeTab}
            onChange={setActiveTab}
            postsCount={safePosts.length}
            pinsCount={safeMapPosts.length}
          />
        </div>

        <div className="mt-8">
          {activeTab === "posts" ? (
            safePosts.length === 0 ? (
              <EmptyPostsState />
            ) : (
              <section>
                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Your memories
                    </div>
                    <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                      Posts
                    </h2>
                  </div>

                  <div className="w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                    {safePosts.length} {safePosts.length === 1 ? "post" : "posts"}
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {safePosts.map((post) => (
                    <ProfilePostCard key={post.id} post={post} />
                  ))}
                </div>
              </section>
            )
          ) : (
            <ProfilePostsMap posts={safeMapPosts} />
          )}
        </div>
      </div>
    </div>
  );
}