// frontend/src/utils/sentimentUi.js
const SENTIMENT_BADGES = {
  positive: {
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    shell: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    color: "#10B981"
  },
  neutral: {
    badge: "bg-amber-50 text-amber-700 ring-amber-200",
    shell: "bg-amber-50 text-amber-700 ring-amber-200",
    color: "#F59E0B"
  },
  negative: {
    badge: "bg-rose-50 text-rose-700 ring-rose-200",
    shell: "bg-rose-50 text-rose-700 ring-rose-200",
    color: "#EF4444"
  }
};

function normalizeSentiment(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "positive" || normalized === "negative") {
    return normalized;
  }
  return "neutral";
}

function normalizeScore(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const n = Number(value);
  if (!Number.isFinite(n)) {
    return null;
  }

  return Math.min(10, Math.max(0, n));
}

function getEmojiForScore(sentiment, sentimentScore) {
  const score = normalizeScore(sentimentScore);

  if (score == null) {
    if (sentiment === "positive") return "😊";
    if (sentiment === "negative") return "😞";
    return "😐";
  }

  if (sentiment === "positive") {
    if (score >= 8.51) return "🤩";
    if (score >= 7.01) return "😊";
    return "🙂";
  }

  if (sentiment === "negative") {
    if (score <= 1.5) return "😡";
    if (score <= 3.0) return "😞";
    return "😕";
  }

  return "😐";
}

function getLabelForVariant(sentiment, variant) {
  const normalizedVariant = String(variant || "default").trim().toLowerCase();

  if (normalizedVariant === "detail") {
    if (sentiment === "positive") return "Positive experience";
    if (sentiment === "negative") return "Negative experience";
    return "Neutral experience";
  }

  if (sentiment === "positive") return "Positive";
  if (sentiment === "negative") return "Negative";
  return "Neutral";
}

export function formatSentimentScore(value, { digits = 1, suffix = " / 10" } = {}) {
  const score = normalizeScore(value);
  if (score == null) {
    return "—";
  }

  return `${score.toFixed(digits)}${suffix}`;
}

export function getSentimentUi(sentiment, sentimentScore = null, variant = "default") {
  const normalizedSentiment = normalizeSentiment(sentiment);
  const base = SENTIMENT_BADGES[normalizedSentiment];

  return {
    sentiment: normalizedSentiment,
    emoji: getEmojiForScore(normalizedSentiment, sentimentScore),
    label: getLabelForVariant(normalizedSentiment, variant),
    badge: base.badge,
    shell: base.shell,
    color: base.color,
    score: normalizeScore(sentimentScore)
  };
}
