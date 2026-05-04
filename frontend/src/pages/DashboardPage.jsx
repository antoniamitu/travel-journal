// frontend/src/pages/DashboardPage.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { getMyDashboard } from "../api/dashboard.js";
import { getPlaceCategoryUi } from "../utils/placeCategoryUi.js";

const SENTIMENT_META = {
  positive: {
    color: "#10B981",
    softClass: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    emoji: "😊"
  },
  neutral: {
    color: "#F59E0B",
    softClass: "bg-amber-50 text-amber-700 ring-amber-200",
    emoji: "😐"
  },
  negative: {
    color: "#EF4444",
    softClass: "bg-rose-50 text-rose-700 ring-rose-200",
    emoji: "😞"
  }
};

const CATEGORY_COLORS = [
  "#7C3AED",
  "#0891B2",
  "#10B981",
  "#F59E0B",
  "#EC4899",
  "#6366F1",
  "#64748B"
];

function asSafeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatMemberSince(value) {
  if (!value) return "Member since —";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Member since —";

  return `Member since ${new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric"
  }).format(date)}`;
}

function formatFullDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium"
  }).format(date);
}

function getDominantItem(items, labelKey = "label") {
  const safeItems = Array.isArray(items) ? items : [];
  const sorted = safeItems
    .filter((item) => asSafeNumber(item?.count) > 0)
    .slice()
    .sort((a, b) => {
      const diff = asSafeNumber(b.count) - asSafeNumber(a.count);
      if (diff !== 0) return diff;
      return String(a?.[labelKey] || "").localeCompare(String(b?.[labelKey] || ""));
    });

  return sorted[0] || null;
}

function getTotalCount(items) {
  return (Array.isArray(items) ? items : []).reduce(
    (sum, item) => sum + asSafeNumber(item?.count),
    0
  );
}

function buildSentimentInsight(sentimentBreakdown) {
  const total = getTotalCount(sentimentBreakdown);
  if (total <= 0) {
    return "Create posts to reveal your emotional travel pattern.";
  }

  const dominant = getDominantItem(sentimentBreakdown);
  if (!dominant) {
    return "Your sentiment pattern will appear once you add more travel memories.";
  }

  const pct = Math.round((asSafeNumber(dominant.count) / total) * 100);
  const sentiment = String(dominant.sentiment || "").toLowerCase();

  if (sentiment === "positive") {
    return `${pct}% of your memories are positive, suggesting your journal is mostly built around enjoyable travel moments.`;
  }

  if (sentiment === "negative") {
    return `${pct}% of your memories are negative, highlighting destinations or experiences that stood out as difficult.`;
  }

  return `${pct}% of your memories are neutral, suggesting balanced and descriptive travel notes.`;
}

function buildTravelPattern({ categoryBreakdown, sentimentBreakdown, activityTimeline, topCountries, postingGap }) {
  const dominantCategory = getDominantItem(categoryBreakdown);
  const dominantSentiment = getDominantItem(sentimentBreakdown);
  const mostActiveMonth = getDominantItem(activityTimeline);
  const topCountry = Array.isArray(topCountries) && topCountries.length > 0 ? topCountries[0] : null;

  const parts = [];

  if (dominantCategory) {
        const categoryLabel = String(dominantCategory.label || "").trim();

        if (String(dominantCategory.category || "").toLowerCase() === "other") {
            parts.push("Your memories cover a varied mix of place types");
        } else {
            parts.push(`You mostly post about ${categoryLabel.toLowerCase()} places`);
        }
    }

  if (dominantSentiment) {
    parts.push(`with a predominantly ${String(dominantSentiment.label || "").toLowerCase()} sentiment`);
  }

  if (mostActiveMonth) {
    parts.push(`and your most active posting month was ${mostActiveMonth.label}`);
  }

  let mainText = parts.length > 0
    ? `${parts.join(", ")}.`
    : "Create more posts to reveal a richer travel pattern.";

  if (topCountry?.country) {
    mainText += ` Your strongest destination cluster is ${topCountry.country}.`;
  }

  let gapText = "Create at least two posts on different days to reveal your longest posting break.";

  if (postingGap) {
    gapText = `Your longest break from posting was ${postingGap.longestGapDays} day${
      postingGap.longestGapDays === 1 ? "" : "s"
    }, between ${formatFullDate(postingGap.from)} and ${formatFullDate(postingGap.to)}.`;
  }

  return {
    mainText,
    gapText
  };
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  const item = payload[0];
  const value = asSafeNumber(item?.value);
  const payloadLabel = item?.payload?.label || item?.payload?.name || label;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-xl">
      <div className="font-bold text-slate-900">{payloadLabel}</div>
      <div className="mt-1 text-slate-600">
        {value} {value === 1 ? "post" : "posts"}
      </div>
    </div>
  );
}

function DashboardLoadingSkeleton() {
  return (
    <div className="min-h-full bg-slate-100">
      <div className="mx-auto max-w-7xl animate-pulse px-4 py-5 lg:px-6 lg:py-6">
        <div className="rounded-[34px] bg-slate-200 px-6 py-12" />

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="h-[420px] rounded-[30px] bg-white" />
          <div className="h-[420px] rounded-[30px] bg-white" />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="h-[380px] rounded-[30px] bg-white" />
          <div className="h-[380px] rounded-[30px] bg-white" />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="h-[300px] rounded-[30px] bg-white" />
          <div className="h-[300px] rounded-[30px] bg-white" />
          <div className="h-[300px] rounded-[30px] bg-white" />
        </div>
      </div>
    </div>
  );
}

function DashboardErrorState({ message, onRetry }) {
  return (
    <div className="min-h-full bg-slate-100">
      <div className="mx-auto max-w-4xl px-4 py-10 lg:px-6">
        <section className="rounded-[30px] border border-slate-200 bg-white p-8 shadow-sm">
          <div className="text-sm font-bold uppercase tracking-[0.16em] text-rose-600">
            Travel Insights
          </div>

          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
            Couldn&apos;t load dashboard
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700"
            >
              Try Again
            </button>

            <Link
              to="/profile"
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Back to Profile
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function DashboardHero({ dashboard }) {
  const totalPosts = asSafeNumber(dashboard?.summary?.totalPosts);
  const memberSince = formatMemberSince(dashboard?.summary?.memberSince);

  return (
    <section className="overflow-hidden rounded-[34px] bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-600 shadow-[0_24px_70px_rgba(124,58,237,0.22)]">
      <div className="relative px-6 py-9 text-white lg:px-9 lg:py-11">
        <div className="absolute -left-28 -top-28 h-80 w-80 rounded-full bg-white/20 blur-3xl" />
        <div className="absolute -bottom-32 right-10 h-80 w-80 rounded-full bg-cyan-200/20 blur-3xl" />

        <div className="relative max-w-4xl">
          <div className="text-sm font-black uppercase tracking-[0.22em] text-white/75">
            Dashboard
          </div>

          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
            Travel Insights
          </h1>

          <p className="mt-4 max-w-3xl text-base font-semibold leading-7 text-white/90 sm:text-lg">
            Visual analytics from your travel memories: activity over time, destination patterns,
            sentiment distribution, place categories and photo-location checks.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <span className="rounded-full bg-white/16 px-4 py-2 text-sm font-bold backdrop-blur">
              Based on {totalPosts} {totalPosts === 1 ? "travel memory" : "travel memories"}
            </span>
            <span className="rounded-full bg-white/16 px-4 py-2 text-sm font-bold backdrop-blur">
              {memberSince}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function EmptyDashboardState() {
  return (
    <section className="mt-6 rounded-[32px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-violet-50 text-3xl">
        📊
      </div>

      <h2 className="mt-5 text-3xl font-black tracking-tight text-slate-950">
        Not enough memories yet
      </h2>

      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">
        Create a few posts to unlock your travel insights, including activity trends, sentiment
        patterns, destination rankings and photo-location checks.
      </p>

      <div className="mt-7">
        <Link
          to="/posts/new"
          className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700"
        >
          Create your first insight
        </Link>
      </div>
    </section>
  );
}

function ActivityTimelineCard({ data }) {
  const hasData = Array.isArray(data) && data.length > 0;

  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
            Activity
          </div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
            Posting activity over time
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Monthly posting volume based on your saved travel memories.
          </p>
        </div>
      </div>

      <div className="mt-6 h-[320px]">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 16, left: -18, bottom: 8 }}>
              <defs>
                <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.34} />
                  <stop offset="95%" stopColor="#7C3AED" stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#7C3AED"
                strokeWidth={3}
                fill="url(#activityGradient)"
                activeDot={{ r: 6 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-500">
            Activity will appear after you create your first post.
          </div>
        )}
      </div>
    </section>
  );
}

function SentimentBreakdownCard({ data }) {
  const total = getTotalCount(data);
  const chartData = (Array.isArray(data) ? data : []).filter((item) => asSafeNumber(item.count) > 0);
  const insight = buildSentimentInsight(data);

  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
      <div className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
        Sentiment
      </div>

      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
        Sentiment breakdown
      </h2>

      <p className="mt-2 text-sm leading-6 text-slate-600">
        Distribution of your automatically classified travel experiences.
      </p>

      <div className="mt-5 h-[230px]">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip content={<ChartTooltip />} />
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="label"
                innerRadius={62}
                outerRadius={92}
                paddingAngle={3}
              >
                {chartData.map((entry) => (
                  <Cell
                    key={entry.sentiment}
                    fill={SENTIMENT_META[entry.sentiment]?.color || "#64748B"}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-500">
            Sentiment distribution will appear after you create posts.
          </div>
        )}
      </div>

      <div className="mt-5 space-y-2">
        {(Array.isArray(data) ? data : []).map((item) => {
          const meta = SENTIMENT_META[item.sentiment] || SENTIMENT_META.neutral;
          const pct = total > 0 ? Math.round((asSafeNumber(item.count) / total) * 100) : 0;

          return (
            <div key={item.sentiment} className="flex items-center justify-between gap-3">
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ring-1 ${meta.softClass}`}>
                <span aria-hidden="true">{meta.emoji}</span>
                <span>{item.label}</span>
              </span>
              <span className="text-sm font-bold text-slate-700">
                {item.count} · {pct}%
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-[22px] border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-semibold leading-6 text-violet-900">
        {insight}
      </div>
    </section>
  );
}

function CategoryDistributionCard({ data }) {
  const chartData = (Array.isArray(data) ? data : []).filter((item) => asSafeNumber(item.count) > 0);
  const chartHeight = Math.max(190, chartData.length * 52 + 72);

  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
      <div className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
        Location intelligence
      </div>

      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
        Place category distribution
      </h2>

      <p className="mt-2 text-sm leading-6 text-slate-600">
        What kind of places you usually write about, based on location classification.
      </p>

      <div className="mt-6" style={{ height: `${chartHeight}px` }}>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 6, right: 18, left: 34, bottom: 6 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="label"
                width={118}
                tick={{ fontSize: 12, fill: "#334155" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" radius={[0, 12, 12, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={entry.category} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-500">
            Category distribution will appear after classified posts are available.
          </div>
        )}
      </div>

      {chartData.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {chartData.map((item) => {
            const ui = getPlaceCategoryUi(item.category);

            return (
              <span
                key={item.category}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ring-1 ${ui.shell}`}
              >
                <span aria-hidden="true">{ui.icon}</span>
                <span>{item.label}</span>
              </span>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function PhotoVerificationCard({ value }) {
  const match = asSafeNumber(value?.match);
  const uncertain = asSafeNumber(value?.uncertain);
  const skipped = asSafeNumber(value?.skipped);
  const mismatch = asSafeNumber(value?.mismatch);
  const total = match + uncertain + skipped + mismatch;

  const rows = [
  {
    key: "match",
    label: "Verified",
    value: match,
    className: "bg-emerald-500",
    badgeClass: "bg-emerald-50 text-emerald-700 ring-emerald-200"
  },
  {
    key: "uncertain",
    label: "Inconclusive",
    value: uncertain,
    className: "bg-amber-500",
    badgeClass: "bg-amber-50 text-amber-700 ring-amber-200"
  },
  {
    key: "skipped",
    label: "Skipped",
    value: skipped,
    className: "bg-slate-400",
    badgeClass: "bg-slate-100 text-slate-700 ring-slate-200"
  },
  ...(mismatch > 0
    ? [
        {
          key: "mismatch",
          label: "Blocked mismatch",
          value: mismatch,
          className: "bg-rose-500",
          badgeClass: "bg-rose-50 text-rose-700 ring-rose-200"
        }
      ]
    : [])
  ];
  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
      <div className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
        Photo checks
      </div>

      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
        Photo-location verification
      </h2>

      <p className="mt-2 text-sm leading-6 text-slate-600">
        Summary of how many posts had their images checked against their selected location.
      </p>

      <div className="mt-6 space-y-4">
        {rows.map((row) => {
          const pct = total > 0 ? Math.round((row.value / total) * 100) : 0;

          return (
            <div key={row.key}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${row.badgeClass}`}>
                  {row.label}
                </span>
                <span className="text-sm font-black text-slate-800">
                  {row.value} · {pct}%
                </span>
              </div>

              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${row.className}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {mismatch > 0 ? (
        <div className="mt-5 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
          {mismatch} saved {mismatch === 1 ? "post has" : "posts have"} a mismatch status. This is counted
          defensively, although the normal posting flow blocks mismatch cases.
        </div>
      ) : (
        <div className="mt-5 rounded-[20px] border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm font-semibold leading-6 text-cyan-900">
          Mismatch cases are not emphasized because the final posting flow treats them as blocking checks.
        </div>
      )}
    </section>
  );
}

function RankingCard({ title, subtitle, items, itemKey, emptyText }) {
  const max = Math.max(...(Array.isArray(items) ? items.map((item) => asSafeNumber(item.count)) : [0]), 0);

  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
      <div className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
        Destinations
      </div>

      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>

      <div className="mt-6 space-y-4">
        {Array.isArray(items) && items.length > 0 ? (
          items.map((item, index) => {
            const count = asSafeNumber(item.count);
            const pct = max > 0 ? Math.max(8, Math.round((count / max) * 100)) : 0;

            return (
              <div key={`${item[itemKey]}-${index}`}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-slate-900">
                      {index + 1}. {item[itemKey]}
                    </div>
                  </div>

                  <div className="shrink-0 text-sm font-bold text-slate-600">
                    {count} {count === 1 ? "post" : "posts"}
                  </div>
                </div>

                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            {emptyText}
          </div>
        )}
      </div>
    </section>
  );
}

function TravelPatternCard({ dashboard }) {
  const pattern = buildTravelPattern({
    categoryBreakdown: dashboard.categoryBreakdown,
    sentimentBreakdown: dashboard.sentimentBreakdown,
    activityTimeline: dashboard.activityTimeline,
    topCountries: dashboard.topCountries,
    postingGap: dashboard.postingGap
  });

  return (
    <section className="rounded-[30px] border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-cyan-50 p-5 shadow-sm lg:p-6">
      <div className="text-sm font-bold uppercase tracking-[0.16em] text-violet-600">
        Behavioral insight
      </div>

      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
        Your travel pattern
      </h2>

      <div className="mt-5 rounded-[24px] border border-white/80 bg-white/80 px-4 py-4 shadow-sm">
        <div className="text-sm font-bold text-slate-900">Pattern summary</div>
        <p className="mt-2 text-sm leading-7 text-slate-700">{pattern.mainText}</p>
      </div>

      <div className="mt-4 rounded-[24px] border border-white/80 bg-white/80 px-4 py-4 shadow-sm">
        <div className="text-sm font-bold text-slate-900">Posting rhythm</div>
        <p className="mt-2 text-sm leading-7 text-slate-700">{pattern.gapText}</p>
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const [status, setStatus] = useState("loading");
  const [dashboard, setDashboard] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const abortRef = useRef(null);

  const loadDashboard = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("loading");
    setErrorMessage("");

    try {
      const data = await getMyDashboard({
        signal: controller.signal,
        timeout: 15000
      });

      setDashboard(data);
      setStatus("ready");
    } catch (err) {
      if (
        err?.name === "CanceledError" ||
        err?.code === "ERR_CANCELED" ||
        err?.name === "AbortError"
      ) {
        return;
      }

      if (!err?.response) {
        setErrorMessage("Connection failed. Please check your internet and try again.");
      } else {
        setErrorMessage(err?.response?.data?.message || "Unable to load dashboard data.");
      }

      setStatus("error");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    loadDashboard();

    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [loadDashboard]);

  const hasPosts = useMemo(() => {
    return asSafeNumber(dashboard?.summary?.totalPosts) > 0;
  }, [dashboard?.summary?.totalPosts]);

  if (status === "loading") {
    return <DashboardLoadingSkeleton />;
  }

  if (status === "error") {
    return <DashboardErrorState message={errorMessage} onRetry={loadDashboard} />;
  }

  return (
    <div className="min-h-full bg-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-5 lg:px-6 lg:py-6">
        <DashboardHero dashboard={dashboard} />

        {!hasPosts ? (
          <EmptyDashboardState />
        ) : (
          <>
            <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
              <ActivityTimelineCard data={dashboard.activityTimeline} />
              <SentimentBreakdownCard data={dashboard.sentimentBreakdown} />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <CategoryDistributionCard data={dashboard.categoryBreakdown} />
              <PhotoVerificationCard value={dashboard.photoVerification} />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <RankingCard
                title="Top countries"
                subtitle="Countries ranked by how many memories you posted there."
                items={dashboard.topCountries}
                itemKey="country"
                emptyText="Country rankings will appear after your posts include country data."
              />

              <RankingCard
                title="Top cities"
                subtitle="Cities ranked by how many memories you posted there."
                items={dashboard.topCities}
                itemKey="city"
                emptyText="City rankings will appear after your posts include city data."
              />

              <TravelPatternCard dashboard={dashboard} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}