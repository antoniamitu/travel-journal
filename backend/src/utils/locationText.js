// backend/src/utils/locationText.js
const MULTIPLE_WHITESPACE_RE = /\s+/g;
const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC_TO_SPACE_RE = /[^a-z0-9]+/g;
const NON_ALPHANUMERIC_RE = /[^a-z0-9]+/g;

const LOCATION_ALIAS_GROUPS = [
  {
    kind: "city",
    canonicalKey: "bucharest",
    canonicalLabel: "Bucharest",
    aliases: [
      "București",
      "Bucuresti",
      "Bucharest",
      "Municipiul București",
      "Municipiul Bucuresti",
      "Bucharest Municipality"
    ]
  },
  {
    kind: "city",
    canonicalKey: "london",
    canonicalLabel: "London",
    aliases: ["London", "Greater London", "City of Westminster"]
  },
  {
    kind: "city",
    canonicalKey: "rome",
    canonicalLabel: "Rome",
    aliases: ["Rome", "Roma"]
  },
  {
    kind: "city",
    canonicalKey: "vienna",
    canonicalLabel: "Vienna",
    aliases: ["Vienna", "Wien"]
  },
  {
    kind: "city",
    canonicalKey: "prague",
    canonicalLabel: "Prague",
    aliases: ["Prague", "Praha"]
  },
  {
    kind: "city",
    canonicalKey: "cluj napoca",
    canonicalLabel: "Cluj-Napoca",
    aliases: ["Cluj-Napoca", "Cluj Napoca", "Cluj"]
  },
  {
    kind: "country",
    canonicalKey: "romania",
    canonicalLabel: "Romania",
    aliases: ["Romania", "România"]
  },
  {
    kind: "country",
    canonicalKey: "united states",
    canonicalLabel: "United States",
    aliases: ["United States", "United States of America", "USA", "U.S.A.", "U S A"]
  },
  {
    kind: "country",
    canonicalKey: "united kingdom",
    canonicalLabel: "United Kingdom",
    aliases: ["United Kingdom", "UK", "U.K.", "U K", "Great Britain"]
  },
  {
    kind: "country",
    canonicalKey: "germany",
    canonicalLabel: "Germany",
    aliases: ["Germany", "Deutschland"]
  },
  {
    kind: "country",
    canonicalKey: "italy",
    canonicalLabel: "Italy",
    aliases: ["Italy", "Italia"]
  },
  {
    kind: "country",
    canonicalKey: "spain",
    canonicalLabel: "Spain",
    aliases: ["Spain", "España", "Espana"]
  },
  {
    kind: "country",
    canonicalKey: "greece",
    canonicalLabel: "Greece",
    aliases: ["Greece", "Grecia"]
  }
];

const aliasByKind = new Map();
const canonicalLabelByKindAndKey = new Map();
const aliasSearchGroups = [];

export function normalizeLocationDisplayText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.normalize("NFC").trim().replace(MULTIPLE_WHITESPACE_RE, " ");
}

function normalizeLocationBaseKey(value) {
  const normalized = normalizeLocationDisplayText(value);
  if (normalized === "") {
    return "";
  }

  return normalized
    .normalize("NFKD")
    .replace(COMBINING_MARKS_RE, "")
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_TO_SPACE_RE, " ")
    .replace(MULTIPLE_WHITESPACE_RE, " ")
    .trim();
}

function compactLocationKey(baseKey) {
  return String(baseKey || "").replace(NON_ALPHANUMERIC_RE, "");
}

function getAllowedKinds(kind) {
  const normalizedKind = typeof kind === "string" ? kind.trim().toLowerCase() : "";

  if (normalizedKind === "city" || normalizedKind === "country") {
    return [normalizedKind];
  }

  return ["generic"];
}

function setAlias(kind, aliasKey, canonicalKey) {
  if (!aliasKey || !canonicalKey) return;

  if (!aliasByKind.has(kind)) {
    aliasByKind.set(kind, new Map());
  }

  aliasByKind.get(kind).set(aliasKey, canonicalKey);
}

function setCanonicalLabel(kind, canonicalKey, canonicalLabel) {
  if (!canonicalKey || !canonicalLabel) return;
  canonicalLabelByKindAndKey.set(`${kind}:${canonicalKey}`, canonicalLabel);
}

function registerAliasGroup(group) {
  const kind = String(group?.kind || "").trim().toLowerCase();
  if (!["city", "country"].includes(kind)) return;

  const canonicalKey = normalizeLocationBaseKey(group.canonicalKey);
  const canonicalLabel = normalizeLocationDisplayText(group.canonicalLabel);

  if (!canonicalKey || !canonicalLabel) return;

  const aliasKeys = new Set([
    canonicalKey,
    ...(Array.isArray(group.aliases) ? group.aliases : []).map(normalizeLocationBaseKey)
  ]);

  aliasKeys.delete("");

  for (const aliasKey of aliasKeys) {
    setAlias(kind, aliasKey, canonicalKey);
    setAlias("generic", aliasKey, canonicalKey);
  }

  setCanonicalLabel(kind, canonicalKey, canonicalLabel);
  setCanonicalLabel("generic", canonicalKey, canonicalLabel);

  aliasSearchGroups.push({
    kind,
    canonicalKey,
    canonicalLabel,
    aliasKeys: Array.from(aliasKeys),
    compactAliasKeys: Array.from(aliasKeys).map(compactLocationKey).filter(Boolean)
  });
}

for (const group of LOCATION_ALIAS_GROUPS) {
  registerAliasGroup(group);
}

export function normalizeOptionalLocationText(value) {
  const normalized = normalizeLocationDisplayText(value);
  return normalized === "" ? undefined : normalized;
}

export function normalizeLocationCompareKey(value, options = {}) {
  const baseKey = normalizeLocationBaseKey(value);
  if (baseKey === "") {
    return "";
  }

  for (const kind of getAllowedKinds(options.kind)) {
    const aliases = aliasByKind.get(kind);
    const canonicalKey = aliases?.get(baseKey);

    if (canonicalKey) {
      return canonicalKey;
    }
  }

  return baseKey;
}

export function getCanonicalLocationDisplayText(value, options = {}) {
  const displayText = normalizeLocationDisplayText(value);
  if (displayText === "") {
    return "";
  }

  const canonicalKey = normalizeLocationCompareKey(displayText, options);
  if (!canonicalKey) {
    return displayText;
  }

  for (const kind of getAllowedKinds(options.kind)) {
    const label = canonicalLabelByKindAndKey.get(`${kind}:${canonicalKey}`);
    if (label) {
      return label;
    }
  }

  return displayText;
}

export function normalizeCityForStorage(value) {
  const normalized = normalizeOptionalLocationText(value);
  if (!normalized) {
    return undefined;
  }

  const canonical = getCanonicalLocationDisplayText(normalized, { kind: "city" });
  return canonical || undefined;
}

export function normalizeCountryForStorage(value) {
  const normalized = normalizeOptionalLocationText(value);
  if (!normalized) {
    return undefined;
  }

  const canonical = getCanonicalLocationDisplayText(normalized, { kind: "country" });
  return canonical || undefined;
}

export function normalizeLocationSearchKey(value, options = {}) {
  const shouldApplyAliases = options.applyAliases !== false;
  const key = shouldApplyAliases
    ? normalizeLocationCompareKey(value, options)
    : normalizeLocationBaseKey(value);

  return compactLocationKey(key);
}

export function buildLocationSearchKeys(value, options = {}) {
  const baseKey = normalizeLocationBaseKey(value);
  const inputCompactKey = compactLocationKey(baseKey);

  if (!inputCompactKey) {
    return [];
  }

  const out = new Set([inputCompactKey]);

  const canonicalKey = normalizeLocationCompareKey(value, options);
  const canonicalCompactKey = compactLocationKey(canonicalKey);
  if (canonicalCompactKey) {
    out.add(canonicalCompactKey);
  }

  const requestedKind =
    typeof options.kind === "string" ? options.kind.trim().toLowerCase() : "";

  for (const group of aliasSearchGroups) {
    if (
      (requestedKind === "city" || requestedKind === "country") &&
      group.kind !== requestedKind
    ) {
      continue;
    }

    const matchesGroup = group.compactAliasKeys.some((aliasCompactKey) => {
      return (
        aliasCompactKey === inputCompactKey ||
        aliasCompactKey.startsWith(inputCompactKey) ||
        inputCompactKey.startsWith(aliasCompactKey)
      );
    });

    if (!matchesGroup) {
      continue;
    }

    const groupCanonicalCompactKey = compactLocationKey(group.canonicalKey);
    if (groupCanonicalCompactKey) {
      out.add(groupCanonicalCompactKey);
    }

    for (const aliasKey of group.aliasKeys) {
      const compactAliasKey = compactLocationKey(aliasKey);
      if (compactAliasKey) {
        out.add(compactAliasKey);
      }
    }
  }

  return Array.from(out).filter(Boolean);
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