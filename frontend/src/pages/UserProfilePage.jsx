// frontend/src/pages/UserProfilePage.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getUserProfileByUsername } from "../api/users.js";
import { useAuth } from "../hooks/useAuth.js";

const DEFAULT_PAGE_SIZE = 20;
const SENTIMENT_OPTIONS = [
  { key: "all", label: "All" },
  { key: "positive", label: "Positive" },
  { key: "neutral", label: "Neutral" },
  { key: "negative", label: "Negative" }
];

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

function optimizeCloudinaryUrl(secureUrl, variant = "card") {
  if (typeof secureUrl !== "string" || !secureUrl.includes("/upload/")) {
    return secureUrl || "";
  }

  const transform =
    variant === "thumb"
      ? "c_fill,w_900,h_560,g_auto,f_auto,q_auto"
      : "c_fill,w_1400,h_900,g_auto,f_auto,q_auto";

  return secureUrl.replace("/upload/", `/upload/${transform}/`);
}

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

function getSentimentUi(sentiment) {
  switch (sentiment) {
    case "positive":
      return {
        label: "Positive",
        shell: "bg-emerald-50 text-emerald-700 ring-emerald-200"
      };
    case "negative":
      return {
        label: "Negative",
        shell: "bg-rose-50 text-rose-700 ring-rose-200"
      };
    default:
      return {
        label: "Neutral",
        shell: "bg-amber-50 text-amber-700 ring-amber-200"
      };
  }
}

function getPrivacyUi(privacy) {
  if (privacy === "private") {
    return {
      label: "Private",
      shell: "bg-slate-100 text-slate-700 ring-slate-200"
    };
  }

  return {
    label: "Public",
    shell: "bg-sky-50 text-sky-700 ring-sky-200"
  };
}

const PLACE_CATEGORY_UI = {
  historical: {
    label: "Historical",
    icon: "🏛️",
    shell: "bg-stone-100 text-stone-700 ring-stone-200"
  },
  religious: {
    label: "Religious",
    icon: "🕍",
    shell: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200"
  },
  nature: {
    label: "Nature",
    icon: "🌿",
    shell: "bg-green-50 text-green-700 ring-green-200"
  },
  entertainment: {
    label: "Entertainment",
    icon: "🎭",
    shell: "bg-indigo-50 text-indigo-700 ring-indigo-200"
  },
  food_drink: {
    label: "Food & Drink",
    icon: "🍽️",
    shell: "bg-orange-50 text-orange-700 ring-orange-200"
  },
  shopping: {
    label: "Shopping",
    icon: "🛍️",
    shell: "bg-pink-50 text-pink-700 ring-pink-200"
  },
  urban_landmark: {
    label: "Urban Landmark",
    icon: "🏙️",
    shell: "bg-cyan-50 text-cyan-700 ring-cyan-200"
  },
  other: {
    label: "Other",
    icon: "📍",
    shell: "bg-slate-100 text-slate-700 ring-slate-200"
  }
};

function normalizePlaceCategory(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PLACE_CATEGORY_UI, normalized) ? normalized : "other";
}

function getPlaceCategoryUi(category) {
  return PLACE_CATEGORY_UI[normalizePlaceCategory(category)] || PLACE_CATEGORY_UI.other;
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

function EmptyPostsState({ sentimentFilter }) {
  const label =
    sentimentFilter === "all"
      ? "This user doesn't have any visible posts yet."
      : `No ${sentimentFilter} posts are visible right now.`;

  return (
    <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-10 text-center shadow-sm">
      <h2 className="text-2xl font-semibold text-slate-900">No posts to show</h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">{label}</p>
    </div>
  );
}

function UserProfileHero({ user, isSelf }) {
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

function SentimentFilters({ value, onChange }) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm lg:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
            Filters
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            Filter by sentiment
          </h2>
        </div>

        <div className="flex flex-wrap gap-3">
          {SENTIMENT_OPTIONS.map((option) => {
            const active = value === option.key;

            return (
              <button
                key={option.key}
                type="button"
                onClick={() => onChange(option.key)}
                className={[
                  "inline-flex min-h-11 items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition",
                  active
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                ].join(" ")}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function UserPostCard({ post }) {
  const imageUrl = getPreviewImage(post);
  const sentimentUi = getSentimentUi(post?.sentiment);
  const privacyUi = getPrivacyUi(post?.privacy);
  const placeCategoryUi = getPlaceCategoryUi(post?.placeCategory);

  return (
    <article className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link
        to={`/posts/${post.id}`}
        className="block focus:outline-none focus:ring-2 focus:ring-emerald-200"
      >
        <div className="overflow-hidden border-b border-slate-200 bg-slate-50">
          {imageUrl ? (
            <img
              src={optimizeCloudinaryUrl(imageUrl, "thumb")}
              alt={post?.title || "Post preview"}
              className="h-52 w-full object-cover transition duration-300 hover:scale-[1.02]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-52 items-center justify-center bg-slate-100 px-4 text-center text-sm text-slate-500">
              No preview image
            </div>
          )}
        </div>

        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${sentimentUi.shell}`}
            >
              {sentimentUi.label}
            </span>

            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${privacyUi.shell}`}
            >
              {privacyUi.label}
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

          <div className="mt-4 text-sm font-medium text-slate-500">{getPostLocation(post)}</div>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
            {post?.title}
          </h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {post?.contentPreview || "Open this memory to see the full story."}
          </p>
        </div>
      </Link>
    </article>
  );
}

export default function UserProfilePage() {
  const navigate = useNavigate();
  const { username } = useParams();
  const { user: currentUser } = useAuth();

  const [status, setStatus] = useState("loading");
  const [profileUser, setProfileUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [sentimentFilter, setSentimentFilter] = useState("all");
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
    async (pageToLoad, { append = false, nextSentiment = sentimentFilter } = {}) => {
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
            limit: DEFAULT_PAGE_SIZE,
            ...(nextSentiment !== "all" ? { sentiment: nextSentiment } : {})
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
        setTotal(Number.isFinite(Number(data?.total)) ? Number(data.total) : 0);
        setPosts((prev) => (append ? [...prev, ...nextPosts] : nextPosts));
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

        const httpStatus = err?.response?.status;
        const nextMessage =
          httpStatus === 404
            ? "We couldn't find this user profile. It may have been deleted or renamed."
            : !err?.response
              ? "We couldn't load this user profile. Please check your connection and try again."
              : err?.response?.data?.message || "Unable to load this user profile right now.";

        if (append && postsLengthRef.current > 0) {
          setPageError(nextMessage);
          return;
        }

        if (httpStatus === 401 || httpStatus === 403) {
          navigate("/login", { replace: true });
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
    [navigate, sentimentFilter, username]
  );

  useEffect(() => {
    setPosts([]);
    setTotal(0);
    setCurrentPage(1);
    loadPage(1, { append: false, nextSentiment: sentimentFilter });

    return () => {
      if (requestAbortRef.current) {
        requestAbortRef.current.abort();
      }
    };
  }, [loadPage, sentimentFilter, username]);

  const handleFilterChange = useCallback((nextFilter) => {
    setSentimentFilter(nextFilter);
  }, []);

  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || status === "loading" || !hasMore) return;
    loadPage(currentPage + 1, { append: true, nextSentiment: sentimentFilter });
  }, [currentPage, hasMore, isLoadingMore, status, loadPage, sentimentFilter]);

  if (status === "loading") {
    return <UserProfileLoadingSkeleton />;
  }

  if (status === "error") {
    return <UserProfileErrorState title={errorState.title} message={errorState.message} />;
  }

  return (
    <div className="min-h-full bg-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-5 lg:px-6 lg:py-6">
        <UserProfileHero user={profileUser} isSelf={isSelf} />

        <div className="mt-6">
          <SentimentFilters value={sentimentFilter} onChange={handleFilterChange} />
        </div>

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

            <div className="flex flex-wrap gap-3">
              <Link
                to="/feed"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Back to Feed
              </Link>
              <Link
                to="/map"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Explore Map
              </Link>
            </div>
          </div>

          {pageError ? (
            <section className="mb-5 rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
              <div className="font-semibold text-rose-800">Couldn't load more posts</div>
              <div className="mt-1">{pageError}</div>
            </section>
          ) : null}

          {posts.length === 0 ? (
            <EmptyPostsState sentimentFilter={sentimentFilter} />
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