// backend/src/utils/classifyPlaceCategory.js

const PLACE_CATEGORY_VALUES = Object.freeze([
  "historical",
  "religious",
  "nature",
  "entertainment",
  "food_drink",
  "shopping",
  "urban_landmark",
  "other"
]);

const GENERIC_OSM_CLASSES_FOR_ENRICHMENT = new Set(["highway", "building", "place"]);
const ADDRESS_TYPES_FOR_ENRICHMENT = new Set(["road", "house_number"]);

const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC_RE = /[^a-z0-9]+/g;
const MULTISPACE_RE = /\s+/g;

const RELIGIOUS_BUILDING_SUBTYPES = new Set([
  "church",
  "cathedral",
  "chapel",
  "basilica",
  "mosque",
  "synagogue",
  "temple",
  "monastery",
  "abbey"
]);

const HISTORICAL_BUILDING_SUBTYPES = new Set([
  "museum",
  "gallery",
  "palace",
  "castle",
  "fort",
  "citadel",
  "ruins"
]);

const FOOD_DRINK_AMENITY_SUBTYPES = new Set([
  "restaurant",
  "cafe",
  "bar",
  "pub",
  "fast_food",
  "food_court",
  "biergarten"
]);

const ENTERTAINMENT_AMENITY_SUBTYPES = new Set([
  "cinema",
  "theatre",
  "theater",
  "nightclub",
  "arts_centre",
  "arts_center"
]);

const ENTERTAINMENT_LEISURE_SUBTYPES = new Set([
  "stadium",
  "sports_centre",
  "sports_center",
  "theme_park",
  "amusement_arcade",
  "water_park"
]);

const NATURE_LEISURE_SUBTYPES = new Set(["park", "garden"]);
const URBAN_LANDMARK_MAN_MADE_SUBTYPES = new Set(["tower", "bridge"]);

function normalizeText(value) {
  if (typeof value !== "string") return "";

  return value
    .trim()
    .normalize("NFKD")
    .replace(COMBINING_MARKS_RE, "")
    .toLowerCase();
}

function normalizeSearchText(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "";

  return normalized.replace(NON_ALPHANUMERIC_RE, " ").replace(MULTISPACE_RE, " ").trim();
}

function tokenizeText(value) {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];

  return normalized.split(" ").filter(Boolean);
}

function buildSearchBag(parts) {
  return parts
    .map((part) => normalizeSearchText(part))
    .filter(Boolean)
    .join(" ")
    .replace(MULTISPACE_RE, " ")
    .trim();
}

function hasWholeWord(tokensSet, phrase) {
  const normalized = normalizeSearchText(phrase);
  if (!normalized) return false;

  const phraseTokens = normalized.split(" ").filter(Boolean);
  if (phraseTokens.length !== 1) {
    return false;
  }

  return tokensSet.has(phraseTokens[0]);
}

function hasPhrase(searchBag, phrase) {
  const normalized = normalizeSearchText(phrase);
  if (!normalized) return false;

  return ` ${searchBag} `.includes(` ${normalized} `);
}

function matchesAnyKeyword(keywordContext, keywords) {
  for (const keyword of keywords) {
    const normalized = normalizeSearchText(keyword);
    if (!normalized) continue;

    if (normalized.includes(" ")) {
      if (hasPhrase(keywordContext.searchBag, normalized)) {
        return true;
      }
      continue;
    }

    if (hasWholeWord(keywordContext.tokensSet, normalized)) {
      return true;
    }
  }

  return false;
}

function normalizeOsmClass(value) {
  return normalizeSearchText(value).replace(/\s+/g, "_");
}

function normalizeOsmSubtype(value) {
  return normalizeSearchText(value).replace(/\s+/g, "_");
}

function normalizeAddressType(value) {
  return normalizeSearchText(value).replace(/\s+/g, "_");
}

function buildKeywordContext(input = {}) {
  // Keep lexical fallback focused on POI-facing text only.
  // Adding city/country creates noise and increases false positives.
  const searchBag = buildSearchBag([input.locationName, input.displayName]);

  return {
    searchBag,
    tokensSet: new Set(tokenizeText(searchBag))
  };
}

const TOURISM_ATTRACTION_KEYWORD_RULES = [
  {
    category: "religious",
    keywords: [
      "church",
      "cathedral",
      "basilica",
      "mosque",
      "synagogue",
      "temple",
      "monastery",
      "chapel",
      "abbey"
    ]
  },
  {
    category: "historical",
    keywords: [
      "museum",
      "gallery",
      "muzeu",
      "palace",
      "castle",
      "fort",
      "citadel",
      "ruins",
      "archaeological site",
      "historic site",
      "monument",
      "memorial"
    ]
  },
  {
    category: "entertainment",
    keywords: [
      "stadium",
      "arena",
      "cinema",
      "theatre",
      "theater",
      "zoo",
      "aquarium",
      "theme park",
      "amusement park"
    ]
  },
  {
    category: "urban_landmark",
    keywords: ["tower", "bridge", "square", "plaza", "fountain", "landmark"]
  },
  {
    category: "nature",
    keywords: ["park", "garden", "forest", "lake", "waterfall", "beach", "mountain"]
  }
];

const KEYWORD_RULES = [
  {
    category: "historical",
    keywords: [
      "museum",
      "gallery",
      "muzeu",
      "palace",
      "castle",
      "fort",
      "citadel",
      "ruins",
      "archaeological site",
      "historic site"
    ]
  },
  {
    category: "religious",
    keywords: [
      "church",
      "cathedral",
      "basilica",
      "mosque",
      "synagogue",
      "temple",
      "monastery",
      "chapel",
      "abbey"
    ]
  },
  {
    category: "food_drink",
    keywords: ["restaurant", "cafe", "bar", "bistro", "pub", "food court"]
  },
  {
    category: "shopping",
    keywords: ["mall", "shopping", "market", "outlet", "shopping centre", "shopping center"]
  },
  {
    category: "entertainment",
    keywords: [
      "theme park",
      "amusement park",
      "stadium",
      "arena",
      "cinema",
      "theatre",
      "theater",
      "zoo",
      "aquarium"
    ]
  },
  {
    category: "nature",
    keywords: [
      "national park",
      "nature reserve",
      "waterfall",
      "beach",
      "mountain",
      "forest",
      "lake",
      "garden",
      "park"
    ]
  },
  {
    category: "urban_landmark",
    keywords: ["tower", "bridge", "square", "plaza", "fountain"]
  },
  {
    category: "historical",
    keywords: ["monument", "memorial"]
  }
];

function classifyTourismAttraction(keywordContext) {
  for (const rule of TOURISM_ATTRACTION_KEYWORD_RULES) {
    if (matchesAnyKeyword(keywordContext, rule.keywords)) {
      return rule.category;
    }
  }

  return "other";
}

function classifyFromOsm(osmClass, osmSubtype, keywordContext) {
  if (!osmClass) {
    return "other";
  }

  if (osmClass === "historic") {
    return "historical";
  }

  if (osmClass === "tourism") {
    if (osmSubtype === "museum" || osmSubtype === "gallery") {
      return "historical";
    }

    if (osmSubtype === "attraction") {
      return classifyTourismAttraction(keywordContext);
    }
  }

  if (osmClass === "amenity") {
    if (osmSubtype === "place_of_worship") {
      return "religious";
    }

    if (FOOD_DRINK_AMENITY_SUBTYPES.has(osmSubtype)) {
      return "food_drink";
    }

    if (osmSubtype === "marketplace") {
      return "shopping";
    }

    if (ENTERTAINMENT_AMENITY_SUBTYPES.has(osmSubtype)) {
      return "entertainment";
    }

    if (osmSubtype === "fountain") {
      return "urban_landmark";
    }
  }

  if (osmClass === "building") {
    if (RELIGIOUS_BUILDING_SUBTYPES.has(osmSubtype)) {
      return "religious";
    }

    if (HISTORICAL_BUILDING_SUBTYPES.has(osmSubtype)) {
      return "historical";
    }
  }

  if (osmClass === "natural") {
    return "nature";
  }

  if (osmClass === "leisure") {
    if (NATURE_LEISURE_SUBTYPES.has(osmSubtype)) {
      return "nature";
    }

    if (ENTERTAINMENT_LEISURE_SUBTYPES.has(osmSubtype)) {
      return "entertainment";
    }
  }

  if (osmClass === "shop") {
    return "shopping";
  }

  if (osmClass === "man_made" && URBAN_LANDMARK_MAN_MADE_SUBTYPES.has(osmSubtype)) {
    return "urban_landmark";
  }

  if (osmClass === "place" && osmSubtype === "square") {
    return "urban_landmark";
  }

  return "other";
}

function classifyFromKeywords(keywordContext) {
  for (const rule of KEYWORD_RULES) {
    if (matchesAnyKeyword(keywordContext, rule.keywords)) {
      return rule.category;
    }
  }

  return "other";
}

function hasAddressLikeType(addressType) {
  return !!addressType && ADDRESS_TYPES_FOR_ENRICHMENT.has(addressType);
}

export function classifyPlaceCategory(input = {}) {
  const osmClass = normalizeOsmClass(input.osmClass);
  const osmSubtype = normalizeOsmSubtype(input.osmSubtype);
  const addressType = normalizeAddressType(input.addressType);
  const keywordContext = buildKeywordContext(input);

  const directCategory = classifyFromOsm(osmClass, osmSubtype, keywordContext);
  if (directCategory !== "other") {
    return directCategory;
  }

  const fallbackCategory = classifyFromKeywords(keywordContext);
  if (fallbackCategory !== "other") {
    // Protection against false positives like:
    // "Church Street", "Bridge Street", "Market Street"
    if (hasAddressLikeType(addressType)) {
      return "other";
    }

    return fallbackCategory;
  }

  return "other";
}

export function shouldEnrichPlaceCategory(input = {}) {
  const osmClass = normalizeOsmClass(input.osmClass);
  const osmSubtype = normalizeOsmSubtype(input.osmSubtype);
  const addressType = normalizeAddressType(input.addressType);
  const keywordContext = buildKeywordContext(input);

  const directCategory = classifyFromOsm(osmClass, osmSubtype, keywordContext);
  if (directCategory !== "other") {
    return false;
  }

  const fallbackCategory = classifyFromKeywords(keywordContext);
  const ambiguousOsmClass = !osmClass || GENERIC_OSM_CLASSES_FOR_ENRICHMENT.has(osmClass);
  const addressLikeType = hasAddressLikeType(addressType);

  // Enrichment only for ambiguous/address-like results that still remained "other"
  // after lexical fallback.
  return (ambiguousOsmClass || addressLikeType) && fallbackCategory === "other";
}

export function isValidPlaceCategory(value) {
  return PLACE_CATEGORY_VALUES.includes(value);
}

export { PLACE_CATEGORY_VALUES };