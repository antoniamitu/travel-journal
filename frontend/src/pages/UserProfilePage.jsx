// frontend/src/pages/UserProfilePage.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getUserProfileByUsername } from "../api/users.js";
import { useAuth } from "../hooks/useAuth.js";
import { formatSentimentScore, getSentimentUi } from "../utils/sentimentUi.js";
import { getPlaceCategoryUi } from "../utils/placeCategoryUi.js";
import { makeCloudinaryOptimizer } from "../utils/cloudinaryImage.js";

const DEFAULT_PAGE_SIZE = 20;

const DEFAULT_PROFILE_STATS = {
  totalPosts: 0,
  publicPosts: 0,
  privatePosts: 0,
  averageSentimentScore: null,
  sentimentCounts: { positive: 0, neutral: 0, negative: 0 },
  countriesVisited: 0,
  citiesVisited: 0
};

function formatMemberSince(value) {
  if (!value) return "Member since —";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Member since —";

  return `Member since ${new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric"
  }).format(date)}`;
}

function formatPostDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium"
  }).format(date);
}

const optimizeCloudinaryUrl = makeCloudinaryOptimizer(
  {
    thumb: "c_fill,w_900,h_620,g_auto,f_auto,q_auto",
    card: "c_fill,w_1400,h_960,g_auto,f_auto,q_auto"
  },
  "card"
);

function getAvatarInitials(user) {
  const source = String(user?.username || "U").trim();
  if (!source) return "U";

  const parts = source.replace(/[@._-]+/g, " ").split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

function getPreviewImage(post) {
  if (Array.isArray(post?.previewImages) && post.previewImages.length > 0) {
    const first = post.previewImages.find((item) => typeof item === "string" && item.trim() !== "");
    if (first) return first;
  }

  if (typeof post?.previewImage === "string" && post.previewImage.trim()) {
    return post.previewImage;
  }

  return "";
}

function getPostLocation(post) {
  const parts = [post?.city, post?.country].filter(
    (item) => typeof item === "string" && item.trim() !== ""
  );

  if (parts.length > 0) {
    return parts.join(", ");
  }

  return post?.locationName || "Unknown location";
}

function UserProfileLocationIcon({ className = "h-5 w-5" }) {
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

function mergeUniquePostsById(existing, incoming) {
  const map = new Map();

  for (const post of existing) {
    if (post?.id != null) {
      map.set(post.id, post);
    }
  }

  for (const post of incoming) {
    if (post?.id != null) {
      map.set(post.id, post);
    }
  }

  return Array.from(map.values());
}


function UserProfileLoadingSkeleton() {
  return (
    <div className="min-h-full bg-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-5 lg:px-6 lg:py-6">
        <div className="animate-pulse overflow-hidden rounded-[32px] bg-white px-6 py-8 shadow-sm lg:px-8 lg:py-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-5">
              <div className="h-24 w-24 rounded-full bg-slate-100" />
              <div>
                <div className="h-10 w-64 rounded-2xl bg-slate-200" />
                <div className="mt-3 h-5 w-40 rounded-xl bg-slate-100" />
              </div>
            </div>
            <div className="h-24 w-full max-w-sm rounded-[24px] bg-slate-100" />
          </div>
        </div>

        <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm lg:p-7">
          <div className="h-5 w-32 rounded-xl bg-slate-200" />
          <div className="mt-5 flex flex-wrap gap-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-11 w-28 rounded-2xl bg-slate-100" />
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="overflow-hidden rounded-[28px] bg-white shadow-sm">
              <div className="h-52 bg-slate-100" />
              <div className="space-y-3 p-5">
                <div className="h-5 w-32 rounded-xl bg-slate-100" />
                <div className="h-8 w-3/4 rounded-xl bg-slate-200" />
                <div className="h-4 w-full rounded-xl bg-slate-100" />
                <div className="h-4 w-4/5 rounded-xl bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UserProfileErrorState({ title, message }) {
  return (
    <div className="min-h-full bg-slate-100">
      <div className="mx-auto max-w-4xl px-4 py-10 lg:px-6">
        <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <div className="text-sm font-semibold uppercase tracking-[0.16em] text-rose-600">
            User profile
          </div>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              to="/feed"
              className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Back to Feed
            </Link>
            <Link
              to="/map"
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Open Map
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyPostsState() {
  return (
    <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-10 text-center shadow-sm">
      <h2 className="text-2xl font-semibold text-slate-900">No posts to show</h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">
        This traveler doesn&apos;t have any visible memories yet.
      </p>
    </div>
  );
}

function UserProfileHero({ user, isSelf, stats }) {
  const avgSentimentLabel = formatSentimentScore(stats?.averageSentimentScore);
  const initials = getAvatarInitials(user);

  return (
    <section className="overflow-hidden rounded-[32px] bg-gradient-to-r from-sky-600 via-cyan-600 to-emerald-600 shadow-sm">
      <div className="px-6 py-8 text-white lg:px-8 lg:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-5">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-4 border-white/80 bg-white/20 text-2xl font-bold shadow-sm backdrop-blur">
              {initials}
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-3xl font-semibold tracking-tight lg:text-5xl">
                @{user?.username || "user"}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-white/90 lg:text-base">
                <span>{formatMemberSince(user?.createdAt)}</span>
                <span className="rounded-full bg-white/14 px-3 py-1 font-semibold backdrop-blur">
                  😊 Avg. sentiment {avgSentimentLabel}
                </span>
                {isSelf ? (
                  <span className="rounded-full bg-white/14 px-3 py-1 font-semibold backdrop-blur">
                    Viewing as owner
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="max-w-md rounded-[24px] border border-white/15 bg-white/10 p-4 backdrop-blur">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">
              Profile view
            </div>
            <div className="mt-3 text-sm leading-6 text-white/90">
              Browse visible memories from this traveler. Private posts appear only when you are
              viewing your own username page.
            </div>
            {isSelf ? (
              <div className="mt-4">
                <Link
                  to="/profile"
                  className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
                >
                  Open account settings
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}


function ProfileOverviewCards({ stats }) {
  const cards = [
    { label: "Visible Posts", value: stats.totalPosts, tone: "text-emerald-700" },
    { label: "Avg. Sentiment", value: formatSentimentScore(stats.averageSentimentScore), tone: "text-amber-700" },
    { label: "Positive", value: stats.sentimentCounts.positive, tone: "text-emerald-700" },
    { label: "Neutral", value: stats.sentimentCounts.neutral, tone: "text-amber-700" },
    { label: "Negative", value: stats.sentimentCounts.negative, tone: "text-rose-700" },
    { label: "Countries", value: stats.countriesVisited, tone: "text-sky-700" }
  ];

  return (
    <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm lg:p-7">
      <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Profile overview</div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((item) => (
          <div key={item.label} className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</div>
            <div className={`mt-3 text-3xl font-semibold tracking-tight ${item.tone}`}>{item.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

const UserPostCard = React.memo(function UserPostCard({ post }) {
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
          <UserProfileLocationIcon className="h-5 w-5 shrink-0 text-cyan-600" />
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
});

export default function UserProfilePage() {
  const navigate = useNavigate();
  const { username } = useParams();
  const { user: currentUser } = useAuth();

  const [status, setStatus] = useState("loading");
  const [profileUser, setProfileUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [stats, setStats] = useState(DEFAULT_PROFILE_STATS);
  const [total, setTotal] = useState(0);

  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorState, setErrorState] = useState({ title: "", message: "" });
  const [pageError, setPageError] = useState("");

  const requestAbortRef = useRef(null);
  const requestIdRef = useRef(0);
  const postsLengthRef = useRef(0);

  const isSelf = useMemo(() => {
    const routeUsername = String(profileUser?.username || username || "").trim().toLowerCase();
    const viewerUsername = String(currentUser?.username || "").trim().toLowerCase();
    return Boolean(routeUsername) && routeUsername === viewerUsername;
  }, [currentUser?.username, profileUser?.username, username]);

  const hasMore = posts.length < total;

  useEffect(() => {
    postsLengthRef.current = posts.length;
  }, [posts.length]);

  const loadPage = useCallback(
    async (pageToLoad, { append = false } = {}) => {
      if (requestAbortRef.current) {
        requestAbortRef.current.abort();
      }

      const controller = new AbortController();
      requestAbortRef.current = controller;
      const requestId = (requestIdRef.current += 1);

      if (append) {
        setIsLoadingMore(true);
      } else {
        setStatus("loading");
      }

      setErrorState({ title: "", message: "" });
      setPageError("");

      try {
        const data = await getUserProfileByUsername(
          username,
          {
            page: pageToLoad,
            limit: DEFAULT_PAGE_SIZE
          },
          {
            signal: controller.signal,
            timeout: 15000
          }
        );

        if (requestId !== requestIdRef.current) {
          return;
        }

        const nextPosts = Array.isArray(data?.posts) ? data.posts : [];

        setProfileUser(data?.user ?? null);
        setStats(data?.stats ?? DEFAULT_PROFILE_STATS);
        setTotal(Number.isFinite(Number(data?.total)) ? Number(data.total) : 0);
        setPosts((prev) => (append ? mergeUniquePostsById(prev, nextPosts) : nextPosts));
        setCurrentPage(pageToLoad);
        setStatus("ready");
      } catch (err) {
        if (
          err?.name === "CanceledError" ||
          err?.code === "ERR_CANCELED" ||
          err?.name === "AbortError"
        ) {
          return;
        }

        if (requestId !== requestIdRef.current) return;

        const httpStatus = err?.response?.status;
        const nextMessage =
          httpStatus === 404
            ? "We couldn't find this user profile. It may have been deleted or renamed."
            : !err?.response
              ? "We couldn't load this user profile. Please check your connection and try again."
              : err?.response?.data?.message || "Unable to load this user profile right now.";

        if (httpStatus === 401 || httpStatus === 403) {
          navigate("/login", { replace: true });
          return;
        }

        if (append && postsLengthRef.current > 0) {
          setPageError(nextMessage);
          return;
        }

        if (httpStatus === 404) {
          setErrorState({
            title: "User not found",
            message: nextMessage
          });
        } else if (!err?.response) {
          setErrorState({
            title: "Connection issue",
            message: nextMessage
          });
        } else {
          setErrorState({
            title: "Failed to load profile",
            message: nextMessage
          });
        }

        setStatus("error");
      } finally {
        if (append) {
          setIsLoadingMore(false);
        }

        if (requestAbortRef.current === controller) {
          requestAbortRef.current = null;
        }
      }
    },
    [navigate, username]
  );

  useEffect(() => {
    setPosts([]);
    setTotal(0);
    setCurrentPage(1);
    loadPage(1, { append: false });

    return () => {
      if (requestAbortRef.current) {
        requestAbortRef.current.abort();
      }
    };
  }, [loadPage, username]);


 const handleLoadMore = useCallback(() => {
    if (isLoadingMore || status === "loading" || !hasMore) return;
    loadPage(currentPage + 1, { append: true });
  }, [currentPage, hasMore, isLoadingMore, status, loadPage]);

  if (status === "loading") {
    return <UserProfileLoadingSkeleton />;
  }

  if (status === "error") {
    return <UserProfileErrorState title={errorState.title} message={errorState.message} />;
  }

  return (
    <div className="min-h-full bg-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-5 lg:px-6 lg:py-6">
        <UserProfileHero user={profileUser} isSelf={isSelf} stats={stats} />

        <ProfileOverviewCards stats={stats} />

        <section className="mt-8">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                Visible memories
              </div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                Posts by @{profileUser?.username || username}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Showing {posts.length} of {total} visible post{total === 1 ? "" : "s"}.
              </p>
            </div>
          </div>

          {pageError ? (
            <section className="mb-5 rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
              <div className="font-semibold text-rose-800">Couldn't load more posts</div>
              <div className="mt-1">{pageError}</div>
            </section>
          ) : null}

          {posts.length === 0 ? (
            <EmptyPostsState />
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {posts.map((post) => (
                <UserPostCard key={post.id} post={post} />
              ))}
            </div>
          )}

          {hasMore ? (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoadingMore || status === "loading"}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isLoadingMore ? "Loading..." : "Load More Posts"}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}