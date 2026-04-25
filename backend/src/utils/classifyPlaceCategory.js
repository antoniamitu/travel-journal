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

const GENERIC_OSM_CLASSES_FOR_ENRICHMENT = new Set([
  "boundary",
  "building",
  "highway",
  "landuse",
  "place"
]);

const GENERIC_NATURAL_SUBTYPES_FOR_ENRICHMENT = new Set([
  "bare_rock",
  "fell",
  "grass",
  "grassland",
  "heath",
  "moor",
  "mud",
  "sand",
  "scree",
  "scrub",
  "shingle",
  "shrubbery",
  "tree",
  "tree_row",
  "tundra",
  "wetland",
  "wood"
]);

const ADDRESS_TYPES_FOR_ENRICHMENT = new Set([
  "house_number",
  "neighbourhood",
  "neighborhood",
  "path",
  "pedestrian",
  "quarter",
  "residential",
  "road",
  "suburb"
]);

const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC_RE = /[^a-z0-9]+/g;
const MULTISPACE_RE = /\s+/g;

const RELIGIOUS_AMENITY_SUBTYPES = new Set(["monastery", "place_of_worship"]);

const FOOD_DRINK_AMENITY_SUBTYPES = new Set([
  "bar",
  "biergarten",
  "cafe",
  "fast_food",
  "food_court",
  "ice_cream",
  "pub",
  "restaurant"
]);

const ENTERTAINMENT_AMENITY_SUBTYPES = new Set([
  "arts_centre",
  "arts_center",
  "casino",
  "cinema",
  "events_venue",
  "exhibition_centre",
  "music_venue",
  "nightclub",
  "planetarium",
  "theatre",
  "theater"
]);

const SHOPPING_AMENITY_SUBTYPES = new Set(["marketplace"]);

const URBAN_LANDMARK_AMENITY_SUBTYPES = new Set(["fountain"]);

const RELIGIOUS_BUILDING_SUBTYPES = new Set([
  "cathedral",
  "chapel",
  "church",
  "kingdom_hall",
  "monastery",
  "mosque",
  "religious",
  "shrine",
  "synagogue",
  "temple"
]);

const HISTORICAL_BUILDING_SUBTYPES = new Set([
  "castle",
  "citadel",
  "fort",
  "manor",
  "palace",
  "ruins",
  "windmill"
]);

const URBAN_LANDMARK_BUILDING_SUBTYPES = new Set([
  "bridge",
  "clock_tower",
  "museum",
  "tower",
  "triumphal_arch"
]);

const ENTERTAINMENT_BUILDING_SUBTYPES = new Set([
  "cinema",
  "grandstand",
  "pavilion",
  "stadium",
  "sports_centre",
  "sports_center",
  "sports_hall",
  "theatre",
  "theater"
]);

const SHOPPING_BUILDING_SUBTYPES = new Set(["kiosk", "retail", "supermarket"]);

const HISTORIC_RELIGIOUS_SUBTYPES = new Set([
  "church",
  "high_cross",
  "monastery",
  "mosque",
  "temple",
  "wayside_cross",
  "wayside_shrine"
]);

const TOURISM_ENTERTAINMENT_SUBTYPES = new Set(["aquarium", "theme_park", "zoo"]);
const TOURISM_NATURE_SUBTYPES = new Set(["viewpoint"]);
const TOURISM_URBAN_LANDMARK_SUBTYPES = new Set([
  "artwork",
  "attraction",
  "gallery",
  "museum"
]);

const LEISURE_NATURE_SUBTYPES = new Set(["beach_resort", "garden", "nature_reserve", "park"]);

const LEISURE_ENTERTAINMENT_SUBTYPES = new Set([
  "adult_gaming_centre",
  "amusement_arcade",
  "dance",
  "escape_game",
  "ice_rink",
  "miniature_golf",
  "sports_centre",
  "stadium",
  "water_park"
]);

const FOOD_DRINK_SHOP_SUBTYPES = new Set([
  "alcohol",
  "bakery",
  "beverages",
  "butcher",
  "cheese",
  "chocolate",
  "coffee",
  "confectionery",
  "dairy",
  "deli",
  "farm",
  "food",
  "frozen_food",
  "greengrocer",
  "health_food",
  "ice_cream",
  "nuts",
  "pasta",
  "pastry",
  "seafood",
  "spices",
  "tea",
  "tortilla",
  "water",
  "wine"
]);

const MAN_MADE_URBAN_LANDMARK_SUBTYPES = new Set([
  "bridge",
  "tower",
  "water_tower",
  "windmill"
]);

const PLACE_URBAN_LANDMARK_SUBTYPES = new Set(["square"]);

const WATERWAY_NATURE_SUBTYPES = new Set(["waterfall"]);

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

function isGenericNaturalForEnrichment(osmClass, osmSubtype) {
  return (
    osmClass === "natural" &&
    (!!osmSubtype ? GENERIC_NATURAL_SUBTYPES_FOR_ENRICHMENT.has(osmSubtype) : true)
  );
}

function buildKeywordContext(input = {}) {
  const searchBag = buildSearchBag([input.locationName, input.displayName]);

  return {
    searchBag,
    tokensSet: new Set(tokenizeText(searchBag))
  };
}

const TOURISM_ATTRACTION_OVERRIDE_RULES = [
  {
    category: "religious",
    keywords: [
      "abbey",
      "basilica",
      "cathedral",
      "chapel",
      "church",
      "eglise",
      "manastire",
      "monastery",
      "mosque",
      "synagogue",
      "temple"
    ]
  },
  {
    category: "entertainment",
    keywords: [
      "aquarium",
      "arena",
      "cinema",
      "opera",
      "opera house",
      "stadium",
      "theater",
      "theatre",
      "theme park",
      "zoo"
    ]
  },
  {
    category: "nature",
    keywords: [
      "beach",
      "forest",
      "garden",
      "lake",
      "mountain",
      "park",
      "viewpoint",
      "waterfall"
    ]
  },
  {
    category: "historical",
    keywords: [
      "archaeological site",
      "castle",
      "castel",
      "cetate",
      "citadel",
      "fort",
      "historic site",
      "memorial",
      "monument",
      "ruins"
    ]
  }
];

const KEYWORD_RULES = [
  {
    category: "religious",
    keywords: [
      "abbey",
      "basilica",
      "biserica",
      "cathedral",
      "cathedrale",
      "catedrala",
      "chapel",
      "church",
      "eglise",
      "manastire",
      "monastery",
      "mosque",
      "mosquee",
      "synagogue",
      "temple",
      "templu"
    ]
  },
  {
    category: "food_drink",
    keywords: [
      "bar",
      "bistro",
      "cafe",
      "cafenea",
      "coffee",
      "food court",
      "ice cream",
      "pub",
      "restaurant"
    ]
  },
  {
    category: "shopping",
    keywords: [
      "bazaar",
      "mall",
      "market",
      "marketplace",
      "outlet",
      "shopping center",
      "shopping centre"
    ]
  },
  {
    category: "entertainment",
    keywords: [
      "aquarium",
      "arena",
      "cinema",
      "opera",
      "opera house",
      "planetarium",
      "stadium",
      "teatru",
      "theater",
      "theatre",
      "theme park",
      "zoo"
    ]
  },
  {
    category: "nature",
    keywords: [
      "beach",
      "cascade",
      "cascada",
      "forest",
      "forêt",
      "garden",
      "gradina",
      "jardin",
      "lake",
      "lac",
      "mountain",
      "munte",
      "nature reserve",
      "park",
      "parc",
      "plage",
      "plaja",
      "waterfall"
    ]
  },
  {
    category: "urban_landmark",
    keywords: [
      "artwork",
      "bridge",
      "fountain",
      "gallery",
      "galerie",
      "landmark",
      "musee",
      "museum",
      "musée",
      "piazza",
      "piata",
      "plaza",
      "pod",
      "pont",
      "square",
      "tower",
      "tour",
      "turn"
    ]
  },
  {
    category: "historical",
    keywords: [
      "archaeological site",
      "castle",
      "castel",
      "cetate",
      "chateau",
      "château",
      "citadel",
      "citadelle",
      "fort",
      "historic site",
      "manor",
      "memorial",
      "monument",
      "palace",
      "palais",
      "palat",
      "ruins"
    ]
  }
];

function classifyTourismAttraction(keywordContext) {
  for (const rule of TOURISM_ATTRACTION_OVERRIDE_RULES) {
    if (matchesAnyKeyword(keywordContext, rule.keywords)) {
      return rule.category;
    }
  }

  return "urban_landmark";
}

function classifyFromOsm(osmClass, osmSubtype, keywordContext) {
  if (!osmClass) {
    return "other";
  }

  if (osmClass === "historic") {
    if (HISTORIC_RELIGIOUS_SUBTYPES.has(osmSubtype)) {
      return "religious";
    }

    return "historical";
  }

  if (osmClass === "tourism") {
    if (TOURISM_ENTERTAINMENT_SUBTYPES.has(osmSubtype)) {
      return "entertainment";
    }

    if (TOURISM_NATURE_SUBTYPES.has(osmSubtype)) {
      return "nature";
    }

    if (osmSubtype === "attraction") {
      return classifyTourismAttraction(keywordContext);
    }

    if (TOURISM_URBAN_LANDMARK_SUBTYPES.has(osmSubtype)) {
      return "urban_landmark";
    }

    return "other";
  }

  if (osmClass === "amenity") {
    if (RELIGIOUS_AMENITY_SUBTYPES.has(osmSubtype)) {
      return "religious";
    }

    if (FOOD_DRINK_AMENITY_SUBTYPES.has(osmSubtype)) {
      return "food_drink";
    }

    if (SHOPPING_AMENITY_SUBTYPES.has(osmSubtype)) {
      return "shopping";
    }

    if (ENTERTAINMENT_AMENITY_SUBTYPES.has(osmSubtype)) {
      return "entertainment";
    }

    if (URBAN_LANDMARK_AMENITY_SUBTYPES.has(osmSubtype)) {
      return "urban_landmark";
    }

    return "other";
  }

  if (osmClass === "building") {
    if (RELIGIOUS_BUILDING_SUBTYPES.has(osmSubtype)) {
      return "religious";
    }

    if (HISTORICAL_BUILDING_SUBTYPES.has(osmSubtype)) {
      return "historical";
    }

    if (URBAN_LANDMARK_BUILDING_SUBTYPES.has(osmSubtype)) {
      return "urban_landmark";
    }

    if (ENTERTAINMENT_BUILDING_SUBTYPES.has(osmSubtype)) {
      return "entertainment";
    }

    if (SHOPPING_BUILDING_SUBTYPES.has(osmSubtype)) {
      return "shopping";
    }

    return "other";
  }

  if (osmClass === "leisure") {
    if (LEISURE_NATURE_SUBTYPES.has(osmSubtype)) {
      return "nature";
    }

    if (LEISURE_ENTERTAINMENT_SUBTYPES.has(osmSubtype)) {
      return "entertainment";
    }

    return "other";
  }

  if (osmClass === "natural") {
    if (isGenericNaturalForEnrichment(osmClass, osmSubtype)) {
      return "other";
    }

    return "nature";
  }

  if (osmClass === "water") {
    return "nature";
  }

  if (osmClass === "waterway") {
    if (WATERWAY_NATURE_SUBTYPES.has(osmSubtype)) {
      return "nature";
    }

    return "other";
  }

  if (osmClass === "shop") {
    if (FOOD_DRINK_SHOP_SUBTYPES.has(osmSubtype)) {
      return "food_drink";
    }

    return "shopping";
  }

  if (osmClass === "man_made") {
    if (MAN_MADE_URBAN_LANDMARK_SUBTYPES.has(osmSubtype)) {
      return "urban_landmark";
    }

    return "other";
  }

  if (osmClass === "place") {
    if (PLACE_URBAN_LANDMARK_SUBTYPES.has(osmSubtype)) {
      return "urban_landmark";
    }

    return "other";
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
  const ambiguousOsmClass =
    !osmClass ||
    GENERIC_OSM_CLASSES_FOR_ENRICHMENT.has(osmClass) ||
    isGenericNaturalForEnrichment(osmClass, osmSubtype);
  const addressLikeType = hasAddressLikeType(addressType);

  return (ambiguousOsmClass || addressLikeType) && fallbackCategory === "other";
}

export function isValidPlaceCategory(value) {
  return PLACE_CATEGORY_VALUES.includes(value);
}

export { PLACE_CATEGORY_VALUES };