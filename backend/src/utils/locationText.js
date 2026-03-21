// backend/src/utils/locationText.js
const MULTIPLE_WHITESPACE_RE = /\s+/g;
const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;

export function normalizeLocationDisplayText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.normalize("NFC").trim().replace(MULTIPLE_WHITESPACE_RE, " ");
}

export function normalizeOptionalLocationText(value) {
  const normalized = normalizeLocationDisplayText(value);
  return normalized === "" ? undefined : normalized;
}

export function normalizeLocationCompareKey(value) {
  const normalized = normalizeLocationDisplayText(value);
  if (normalized === "") {
    return "";
  }

  return normalized
    .normalize("NFKD")
    .replace(COMBINING_MARKS_RE, "")
    .toLowerCase();
}

export function countDistinctNormalizedLocationValues(values) {
  const seen = new Set();

  for (const value of values || []) {
    const key = normalizeLocationCompareKey(value);
    if (key !== "") {
      seen.add(key);
    }
  }

  return seen.size;
}