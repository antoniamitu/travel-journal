// backend/src/constants/sentiment.js
export const SENTIMENTS = Object.freeze({
  POSITIVE: "positive",
  NEUTRAL: "neutral",
  NEGATIVE: "negative"
});

export const SENTIMENT_VALUES = Object.freeze(Object.values(SENTIMENTS));

export const SENTIMENT_SCORE_RANGE = Object.freeze({
  MIN: 0,
  MAX: 10
});

export const SENTIMENT_THRESHOLDS = Object.freeze({
  NEGATIVE_MAX: 4.24,
  NEUTRAL_MAX: 5.75
});

export const NEUTRAL_SENTIMENT_SCORE = 5;

export function clampSentimentScore(score) {
  const n = Number(score);

  if (!Number.isFinite(n)) {
    return NEUTRAL_SENTIMENT_SCORE;
  }

  return Math.min(SENTIMENT_SCORE_RANGE.MAX, Math.max(SENTIMENT_SCORE_RANGE.MIN, n));
}

export function roundSentimentScore(score) {
  return Math.round(clampSentimentScore(score) * 100) / 100;
}

export function scoreToLabel(score) {
  const rounded = roundSentimentScore(score);

  if (rounded <= SENTIMENT_THRESHOLDS.NEGATIVE_MAX) {
    return SENTIMENTS.NEGATIVE;
  }

  if (rounded <= SENTIMENT_THRESHOLDS.NEUTRAL_MAX) {
    return SENTIMENTS.NEUTRAL;
  }

  return SENTIMENTS.POSITIVE;
}