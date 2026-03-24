// frontend/src/components/profile/OwnProfile.jsx
import React, { useMemo } from "react";
import { Link } from "react-router-dom";

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
  const source = String(user?.username || user?.email || "U").trim();
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

function ProfileStatCard({ label, value, tone = "slate" }) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "sky"
        ? "text-sky-700"
        : tone === "violet"
          ? "text-violet-700"
          : tone === "rose"
            ? "text-rose-700"
            : tone === "amber"
              ? "text-amber-700"
              : "text-slate-700";

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className={`mt-3 text-3xl font-semibold tracking-tight ${toneClass}`}>{value}</div>
    </div>
  );
}

function ProfileHero({ user, stats }) {
  const initials = getAvatarInitials(user);

  return (
    <section className="overflow-hidden rounded-[32px] bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 shadow-sm">
      <div className="px-6 py-8 text-white lg:px-8 lg:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-5">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-4 border-white/80 bg-white/20 text-2xl font-bold shadow-sm backdrop-blur">
              {initials}
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-3xl font-semibold tracking-tight lg:text-5xl">
                {user?.username || "Your Profile"}
              </h1>

              <div className="mt-3 flex flex-col gap-1 text-sm text-white/90 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 lg:text-base">
                <span>{user?.email || "—"}</span>
                <span className="hidden sm:inline">•</span>
                <span>{formatMemberSince(user?.createdAt)}</span>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-semibold text-white/95 lg:text-base">
                <span className="rounded-full bg-white/14 px-3 py-1 backdrop-blur">
                  🌍 {stats.countriesVisited} countries
                </span>
                <span className="rounded-full bg-white/14 px-3 py-1 backdrop-blur">
                  📝 {stats.totalPosts} memories
                </span>
                <span className="rounded-full bg-white/14 px-3 py-1 backdrop-blur">
                  🏙️ {stats.citiesVisited} cities
                </span>
              </div>
            </div>
          </div>

          <div className="max-w-md rounded-[24px] border border-white/15 bg-white/10 p-4 backdrop-blur">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">
              Account snapshot
            </div>
            <div className="mt-3 text-sm leading-6 text-white/90">
              Your profile shows your travel activity, sentiment breakdown, and your latest memories
              in one place.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProfileSummaryCard({ user, stats }) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm lg:p-7">
      <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
        User details
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <div className="text-sm font-medium text-slate-500">Username</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{user?.username || "—"}</div>
        </div>

        <div>
          <div className="text-sm font-medium text-slate-500">Email</div>
          <div className="mt-1 break-words text-slate-900">{user?.email || "—"}</div>
        </div>

        <div>
          <div className="text-sm font-medium text-slate-500">Membership</div>
          <div className="mt-1 text-slate-900">{formatMemberSince(user?.createdAt)}</div>
        </div>
      </div>

      <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
        <div className="text-sm font-semibold text-slate-900">Visibility breakdown</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Public posts
            </div>
            <div className="mt-2 text-2xl font-semibold text-sky-700">{stats.publicPosts}</div>
          </div>

          <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Private posts
            </div>
            <div className="mt-2 text-2xl font-semibold text-violet-700">{stats.privatePosts}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AccountSettingsCard({ onDeleteRequest, deleteDisabled = false }) {
  return (
    <section className="rounded-[28px] border border-rose-200 bg-white p-6 shadow-sm lg:p-7">
      <div className="text-sm font-semibold uppercase tracking-[0.16em] text-rose-600">
        Account settings
      </div>

      <h2 className="mt-3 text-xl font-semibold text-slate-900">Delete account</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        This permanently removes your account, posts, and attached images. Cloudinary cleanup is
        best-effort, but your account data will still be deleted.
      </p>

      <button
        type="button"
        onClick={onDeleteRequest}
        disabled={deleteDisabled}
        aria-label="Delete account"
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300"
      >
        Delete Account
      </button>
    </section>
  );
}

function RecentPostCard({ post }) {
  const imageUrl = getPreviewImage(post);
  const sentimentUi = getSentimentUi(post?.sentiment);

  return (
    <Link
      to={`/posts/${post.id}`}
      className="group overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-200"
    >
      <div className="overflow-hidden border-b border-slate-200 bg-slate-50">
        {imageUrl ? (
          <img
            src={optimizeCloudinaryUrl(imageUrl, "thumb")}
            alt={post?.title || "Post preview"}
            className="h-52 w-full object-cover transition duration-300 group-hover:scale-[1.02]"
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

          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {formatPostDate(post?.createdAt)}
          </span>
        </div>

        <div className="mt-4 text-sm font-medium text-slate-500">{getPostLocation(post)}</div>

        <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">{post?.title}</h3>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          {post?.contentPreview || "Open this memory to see the full story."}
        </p>
      </div>
    </Link>
  );
}

function EmptyRecentPostsState() {
  return (
    <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-10 text-center shadow-sm">
      <h3 className="text-2xl font-semibold text-slate-900">No posts yet</h3>
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
  recentPosts,
  onDeleteRequest,
  deleteDisabled = false
}) {
  const safeRecentPosts = Array.isArray(recentPosts) ? recentPosts : [];

  const statCards = useMemo(
    () => [
      { label: "Total Posts", value: stats.totalPosts, tone: "emerald" },
      { label: "Public Posts", value: stats.publicPosts, tone: "sky" },
      { label: "Private Posts", value: stats.privatePosts, tone: "violet" },
      { label: "Countries Visited", value: stats.countriesVisited, tone: "emerald" },
      { label: "Cities Visited", value: stats.citiesVisited, tone: "sky" },
      { label: "Positive", value: stats.sentimentCounts.positive, tone: "emerald" },
      { label: "Neutral", value: stats.sentimentCounts.neutral, tone: "amber" },
      { label: "Negative", value: stats.sentimentCounts.negative, tone: "rose" }
    ],
    [stats]
  );

  return (
    <div className="min-h-full bg-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-5 lg:px-6 lg:py-6">
        <ProfileHero user={user} stats={stats} />

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <ProfileSummaryCard user={user} stats={stats} />
            <AccountSettingsCard
              onDeleteRequest={onDeleteRequest}
              deleteDisabled={deleteDisabled}
            />
          </div>

          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm lg:p-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Statistics
                </div>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                  Travel activity
                </h2>
              </div>

              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {safeRecentPosts.length} recent {safeRecentPosts.length === 1 ? "post" : "posts"}
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {statCards.map((item) => (
                <ProfileStatCard
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  tone={item.tone}
                />
              ))}
            </div>
          </section>
        </div>

        <section className="mt-8">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                Recent activity
              </div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                Recent posts
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Your latest memories appear here. Open any card to see the full post.
              </p>
            </div>

            <Link
              to="/feed"
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              View All Posts
            </Link>
          </div>

          {safeRecentPosts.length === 0 ? (
            <EmptyRecentPostsState />
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {safeRecentPosts.map((post) => (
                <RecentPostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}