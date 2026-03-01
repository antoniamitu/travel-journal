// backend/src/utils/normalizeQuery.js

/**
 * Normalize search text for cache key:
 * - trim + lowercase
 * - remove diacritics (NFD)
 * - replace punctuation/symbols with space
 * - keep letters/digits from ANY alphabet (Unicode-aware)
 * - collapse multiple spaces
 *
 * Examples:
 *  "  Pâris!!!   Fränce  " -> "paris france"
 *  "Αθήνα, Ελλάδα" -> "αθηνα ελλαδα"
 */
export function normalizeQuery(input) {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw) return "";

  // Remove diacritics (Latin + many combining marks)
  const noDiacritics = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Keep letters (\p{L}), numbers (\p{N}), and spaces. Everything else -> space.
  // Node 22 supports Unicode property escapes.
  const keepLettersNumsSpaces = noDiacritics.replace(/[^\p{L}\p{N}\s]+/gu, " ");

  return keepLettersNumsSpaces.replace(/\s+/g, " ").trim();
}