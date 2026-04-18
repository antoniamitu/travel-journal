// backend/src/utils/analyzeSentiment.js
import {
  clampSentimentScore,
  roundSentimentScore,
  scoreToLabel,
  NEUTRAL_SENTIMENT_SCORE
} from "../constants/sentiment.js";

const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;
const WHITESPACE_RE = /\s+/g;
const TOKEN_RE = /[a-z0-9]+/g;

const TITLE_WEIGHT = 1.15;
const CONTENT_WEIGHT = 1.0;
const SCORE_SCALE = 0.85;
const MAX_OCCURRENCES_PER_SIGNAL = 2;
const NEGATION_LOOKBACK = 3;
const INTENSIFIER_MULTIPLIER = 1.15;
const DIMINISHER_MULTIPLIER = 0.85;
const CONTRAST_BEFORE_MULTIPLIER = 0.9;
const CONTRAST_AFTER_MULTIPLIER = 1.1;

const WEAK_SIGNAL_WEIGHT = 0.35;
const STRONG_SIGNAL_WEIGHT = 0.7;

const WEAK_POSITIVE_WORDS = [
  "nice",
  "good",
  "pretty",
  "calm",
  "decent",
  "okay",
  "ok",
  "pleasant",
  "clean",
  "fine",
  "comfortable",
  "cozy",
  "cosy",
  "enjoyable",
  "relaxing",
  "welcoming",
  "tasty",
  "interesting",
  "fun",
  "peaceful",
  "frumos",
  "placut",
  "bun",
  "linistit",
  "curat",
  "confortabil",
  "accesibil",
  "usor",
  "interesant",
  "gustos",
  "primitor",
  "dragut"
];

const STRONG_POSITIVE_WORDS = [
  "amazing",
  "beautiful",
  "wonderful",
  "excellent",
  "superb",
  "unforgettable",
  "breathtaking",
  "stunning",
  "perfect",
  "spectacular",
  "recommend",
  "recommended",
  "love",
  "loved",
  "favorite",
  "favourite",
  "best",
  "charming",
  "magnificent",
  "incredible",
  "fantastic",
  "minunat",
  "extraordinar",
  "impresionant",
  "recomand",
  "exceptional",
  "magnific",
  "spectaculos",
  "fenomenal",
  "incredibil",
  "uimitor",
  "splendid",
  "fermecator"
];

const WEAK_NEGATIVE_WORDS = [
  "crowded",
  "noisy",
  "expensive",
  "overpriced",
  "average",
  "boring",
  "mediocre",
  "slow",
  "basic",
  "dull",
  "overrated",
  "tiring",
  "uncomfortable",
  "ordinary",
  "meh",
  "forgettable",
  "underwhelming",
  "aglomerat",
  "zgomotos",
  "scump",
  "banal",
  "plictisitor",
  "mediocru",
  "lent",
  "limitat",
  "obositor",
  "incomod",
  "obisnuit",
  "simplu",
  "nesatisfacator"
];

const STRONG_NEGATIVE_WORDS = [
  "terrible",
  "awful",
  "dirty",
  "disappointing",
  "unsafe",
  "disgusting",
  "horrible",
  "dreadful",
  "hostile",
  "unbearable",
  "miserable",
  "depressing",
  "revolting",
  "nightmare",
  "hate",
  "hated",
  "avoid",
  "regret",
  "filthy",
  "appalling",
  "atrocious",
  "wretched",
  "pathetic",
  "abysmal",
  "waste",
  "ruined",
  "scam",
  "rude",
  "dangerous",
  "oribil",
  "groaznic",
  "dezamagitor",
  "murdar",
  "periculos",
  "dezgustator",
  "ingrozitor",
  "nasol",
  "mizerabil",
  "deprimant",
  "cosmar",
  "evita",
  "stricat",
  "dezastru",
  "penibil",
  "respingator",
  "execrabil"
];

const PHRASE_GROUPS = [
  { alternatives: ["would recommend", "highly recommend"], weight: 1.3 },
  { alternatives: ["must see", "must visit"], weight: 1.3 },
  { alternatives: ["worth it", "worth visiting", "worth the trip"], weight: 1.0 },
  { alternatives: ["better than expected"], weight: 0.9 },
  { alternatives: ["hidden gem"], weight: 1.0 },
  { alternatives: ["a real treat", "such a treat"], weight: 0.9 },
  { alternatives: ["exceeded expectations"], weight: 1.1 },

  { alternatives: ["not worth it", "not worth visiting"], weight: -1.6 },
  { alternatives: ["hardly worth it"], weight: -1.2 },
  { alternatives: ["barely worth it"], weight: -0.9 },
  { alternatives: ["would not recommend", "do not recommend"], weight: -1.8 },
  { alternatives: ["waste of time", "waste of money"], weight: -1.8 },
  { alternatives: ["nothing special"], weight: -0.55 },
  { alternatives: ["rip off", "tourist trap"], weight: -1.3 },
  { alternatives: ["could be better", "could have been better"], weight: -0.35 },
  { alternatives: ["fell short"], weight: -0.7 },
  { alternatives: ["left a lot to be desired"], weight: -0.9 },
  { alternatives: ["not bad"], weight: 0.25 },
  { alternatives: ["not great"], weight: -0.25 },

  { alternatives: ["merita vazut", "merita vizitat"], weight: 1.1 },
  { alternatives: ["recomand cu caldura"], weight: 1.3 },
  { alternatives: ["loc deosebit", "experienta deosebita"], weight: 1.0 },
  { alternatives: ["mai bine decat ma asteptam"], weight: 0.9 },
  { alternatives: ["o adevarata bijuterie"], weight: 1.1 },
  { alternatives: ["a depasit asteptarile"], weight: 1.1 },

  { alternatives: ["nu merita", "nici nu merita"], weight: -1.6 },
  { alternatives: ["nu recomand", "nici nu recomand"], weight: -1.8 },
  { alternatives: ["pierdere de timp", "pierdere de bani"], weight: -1.8 },
  { alternatives: ["nimic special"], weight: -0.55 },
  { alternatives: ["capcana pentru turisti"], weight: -1.3 },
  { alternatives: ["ar putea fi mai bine"], weight: -0.35 },
  { alternatives: ["a lasat de dorit"], weight: -0.9 },
  { alternatives: ["nu e rau", "nu i rau"], weight: 0.25 },
  { alternatives: ["nu e grozav", "nu i grozav"], weight: -0.25 }
];

const NEGATION_GROUPS = [
  "not",
  "no",
  "never",
  "without",
  "barely",
  "hardly",
  "nu",
  "nici",
  "niciodata",
  "deloc",
  "fara"
];

const INTENSIFIER_GROUPS = [
  "very",
  "really",
  "extremely",
  "incredibly",
  "absolutely",
  "so",
  "truly",
  "totally",
  "completely",
  "remarkably",
  "foarte",
  "extrem de",
  "chiar",
  "absolut",
  "total",
  "complet",
  "cu adevarat",
  "nemaipomenit de"
];

const DIMINISHER_GROUPS = [
  "a bit",
  "slightly",
  "somewhat",
  "a little",
  "kind of",
  "sort of",
  "fairly",
  "rather",
  "putin",
  "cam",
  "oarecum",
  "destul de"
];

const CONTRAST_MARKER_GROUPS = [
  "but",
  "however",
  "though",
  "although",
  "yet",
  "unfortunately",
  "dar",
  "insa",
  "totusi",
  "desi",
  "cu toate ca",
  "din pacate"
];

function normalizeText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_MARKS_RE, "")
    .replace(WHITESPACE_RE, " ");
}

function tokenizeNormalizedText(text) {
  return text.match(TOKEN_RE) || [];
}

function compilePhraseGroups(groups) {
  return groups
    .flatMap((group) => {
      const canonicalKey = normalizeText(group.alternatives[0]);

      return group.alternatives.map((alternative) => {
        const normalized = normalizeText(alternative);

        return {
          key: canonicalKey,
          weight: group.weight,
          tokens: tokenizeNormalizedText(normalized)
        };
      });
    })
    .filter((entry) => entry.tokens.length > 0)
    .sort((a, b) => b.tokens.length - a.tokens.length || Math.abs(b.weight) - Math.abs(a.weight));
}

function compileTokenGroups(groups) {
  const seen = new Set();

  return groups
    .map((value) => {
      const normalized = normalizeText(value);

      return {
        key: normalized,
        tokens: tokenizeNormalizedText(normalized)
      };
    })
    .filter((entry) => entry.tokens.length > 0)
    .filter((entry) => {
      if (seen.has(entry.key)) {
        return false;
      }

      seen.add(entry.key);
      return true;
    })
    .sort((a, b) => b.tokens.length - a.tokens.length);
}

function createNormalizedWordWeights(groups) {
  const wordWeights = new Map();

  for (const { words, weight } of groups) {
    for (const word of words) {
      const normalized = normalizeText(word);
      const tokens = tokenizeNormalizedText(normalized);

      if (tokens.length !== 1) {
        continue;
      }

      wordWeights.set(tokens[0], weight);
    }
  }

  return wordWeights;
}

function createNormalizedTokenSet(groups) {
  const values = new Set();

  for (const value of groups) {
    const normalized = normalizeText(value);
    const tokens = tokenizeNormalizedText(normalized);

    if (tokens.length === 1) {
      values.add(tokens[0]);
    }
  }

  return values;
}

const WORD_WEIGHTS = createNormalizedWordWeights([
  { words: WEAK_POSITIVE_WORDS, weight: WEAK_SIGNAL_WEIGHT },
  { words: STRONG_POSITIVE_WORDS, weight: STRONG_SIGNAL_WEIGHT },
  { words: WEAK_NEGATIVE_WORDS, weight: -WEAK_SIGNAL_WEIGHT },
  { words: STRONG_NEGATIVE_WORDS, weight: -STRONG_SIGNAL_WEIGHT }
]);

const NEGATION_TOKENS = createNormalizedTokenSet(NEGATION_GROUPS);
const COMPILED_PHRASES = compilePhraseGroups(PHRASE_GROUPS);
const COMPILED_INTENSIFIERS = compileTokenGroups(INTENSIFIER_GROUPS);
const COMPILED_DIMINISHERS = compileTokenGroups(DIMINISHER_GROUPS);
const COMPILED_CONTRAST_MARKERS = compileTokenGroups(CONTRAST_MARKER_GROUPS);

function createUsedMask(length) {
  return Array.from({ length }, () => false);
}

function matchesTokenSequence(tokens, startIndex, sequence) {
  if (startIndex + sequence.length > tokens.length) {
    return false;
  }

  for (let offset = 0; offset < sequence.length; offset += 1) {
    if (tokens[startIndex + offset] !== sequence[offset]) {
      return false;
    }
  }

  return true;
}

function markRangeUsed(used, startIndex, length) {
  for (let idx = startIndex; idx < startIndex + length; idx += 1) {
    used[idx] = true;
  }
}

function findLastMarkerSpan(tokens) {
  let match = null;

  for (let index = 0; index < tokens.length; index += 1) {
    for (const marker of COMPILED_CONTRAST_MARKERS) {
      if (matchesTokenSequence(tokens, index, marker.tokens)) {
        match = {
          start: index,
          end: index + marker.tokens.length
        };
        break;
      }
    }
  }

  return match;
}

function getClauseMultiplier(tokenIndex, markerSpan) {
  if (!markerSpan) {
    return 1;
  }

  if (tokenIndex < markerSpan.start) {
    return CONTRAST_BEFORE_MULTIPLIER;
  }

  if (tokenIndex >= markerSpan.end) {
    return CONTRAST_AFTER_MULTIPLIER;
  }

  return 1;
}

function hasNegationBefore(tokens, tokenIndex) {
  const from = Math.max(0, tokenIndex - NEGATION_LOOKBACK);

  for (let idx = tokenIndex - 1; idx >= from; idx -= 1) {
    if (NEGATION_TOKENS.has(tokens[idx])) {
      return true;
    }
  }

  return false;
}

function matchTrailingSequence(tokens, endExclusive, compiledGroups) {
  for (const group of compiledGroups) {
    const start = endExclusive - group.tokens.length;

    if (start < 0) {
      continue;
    }

    if (matchesTokenSequence(tokens, start, group.tokens)) {
      return group;
    }
  }

  return null;
}

function getModifierMultiplier(tokens, tokenIndex) {
  const intensifier = matchTrailingSequence(tokens, tokenIndex, COMPILED_INTENSIFIERS);
  if (intensifier) {
    return INTENSIFIER_MULTIPLIER;
  }

  const diminisher = matchTrailingSequence(tokens, tokenIndex, COMPILED_DIMINISHERS);
  if (diminisher) {
    return DIMINISHER_MULTIPLIER;
  }

  return 1;
}

function incrementOccurrence(occurrenceMap, key) {
  const nextValue = (occurrenceMap.get(key) || 0) + 1;
  occurrenceMap.set(key, nextValue);
  return nextValue;
}

function applyOccurrenceCap(occurrenceMap, key) {
  return incrementOccurrence(occurrenceMap, key) <= MAX_OCCURRENCES_PER_SIGNAL;
}

function processField(text, fieldWeight, occurrenceMap) {
  const normalized = normalizeText(text);
  const tokens = tokenizeNormalizedText(normalized);

  if (tokens.length === 0) {
    return {
      total: 0,
      matchedSignals: 0
    };
  }

  const used = createUsedMask(tokens.length);
  const markerSpan = findLastMarkerSpan(tokens);

  let total = 0;
  let matchedSignals = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    if (used[index]) {
      continue;
    }

    const phrase = COMPILED_PHRASES.find((entry) => {
      if (!matchesTokenSequence(tokens, index, entry.tokens)) {
        return false;
      }

      for (let cursor = index; cursor < index + entry.tokens.length; cursor += 1) {
        if (used[cursor]) {
          return false;
        }
      }

      return true;
    });

    if (!phrase) {
      continue;
    }

    matchedSignals += 1;

    if (applyOccurrenceCap(occurrenceMap, `phrase:${phrase.key}`)) {
      total += phrase.weight * fieldWeight * getClauseMultiplier(index, markerSpan);
    }

    markRangeUsed(used, index, phrase.tokens.length);
    index += phrase.tokens.length - 1;
  }

  for (let index = 0; index < tokens.length; index += 1) {
    if (used[index]) {
      continue;
    }

    const token = tokens[index];
    const baseWeight = WORD_WEIGHTS.get(token);

    if (typeof baseWeight !== "number") {
      continue;
    }

    matchedSignals += 1;

    let effectiveWeight = baseWeight;
    const negated = hasNegationBefore(tokens, index);

    if (negated) {
      effectiveWeight *= -0.5;
    } else {
      effectiveWeight *= getModifierMultiplier(tokens, index);
    }

    if (applyOccurrenceCap(occurrenceMap, `word:${token}`)) {
      total += effectiveWeight * fieldWeight * getClauseMultiplier(index, markerSpan);
    }
  }

  return {
    total,
    matchedSignals
  };
}

export function analyzeSentiment({ title, content } = {}) {
  // Intentionally shared across title + content so the same normalized signal
  // contributes at most 2 times in the entire post, not 2 times per field.
  const occurrenceMap = new Map();

  const titleResult = processField(title, TITLE_WEIGHT, occurrenceMap);
  const contentResult = processField(content, CONTENT_WEIGHT, occurrenceMap);

  const matchedSignals = titleResult.matchedSignals + contentResult.matchedSignals;

  if (matchedSignals === 0) {
    return {
      score: NEUTRAL_SENTIMENT_SCORE,
      label: scoreToLabel(NEUTRAL_SENTIMENT_SCORE)
    };
  }

  const rawDelta = titleResult.total + contentResult.total;
  const rawScore = NEUTRAL_SENTIMENT_SCORE + rawDelta * SCORE_SCALE;
  const score = roundSentimentScore(clampSentimentScore(rawScore));

  return {
    score,
    label: scoreToLabel(score)
  };
}

export default analyzeSentiment;