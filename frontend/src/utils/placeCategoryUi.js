// frontend/src/utils/placeCategoryUi.js

export const PLACE_CATEGORY_UI = {
  historical: {
    label: "Historical",
    icon: "🏛️",
    shortLabel: "H",
    badge: "bg-stone-100 text-stone-700 ring-stone-200",
    shell: "bg-stone-100 text-stone-700 ring-stone-200"
  },
  religious: {
    label: "Religious",
    icon: "🕍",
    shortLabel: "R",
    badge: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
    shell: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200"
  },
  nature: {
    label: "Nature",
    icon: "🌿",
    shortLabel: "N",
    badge: "bg-green-50 text-green-700 ring-green-200",
    shell: "bg-green-50 text-green-700 ring-green-200"
  },
  entertainment: {
    label: "Entertainment",
    icon: "🎭",
    shortLabel: "E",
    badge: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    shell: "bg-indigo-50 text-indigo-700 ring-indigo-200"
  },
  food_drink: {
    label: "Food & Drink",
    icon: "🍽️",
    shortLabel: "F",
    badge: "bg-orange-50 text-orange-700 ring-orange-200",
    shell: "bg-orange-50 text-orange-700 ring-orange-200"
  },
  shopping: {
    label: "Shopping",
    icon: "🛍️",
    shortLabel: "S",
    badge: "bg-pink-50 text-pink-700 ring-pink-200",
    shell: "bg-pink-50 text-pink-700 ring-pink-200"
  },
  urban_landmark: {
    label: "Urban Landmark",
    icon: "🏙️",
    shortLabel: "U",
    badge: "bg-cyan-50 text-cyan-700 ring-cyan-200",
    shell: "bg-cyan-50 text-cyan-700 ring-cyan-200"
  },
  other: {
    label: "Other",
    icon: "📍",
    shortLabel: "O",
    badge: "bg-slate-100 text-slate-700 ring-slate-200",
    shell: "bg-slate-100 text-slate-700 ring-slate-200"
  }
};

export const PLACE_CATEGORY_KEYS = Object.freeze(Object.keys(PLACE_CATEGORY_UI));

export const PLACE_CATEGORY_FILTER_OPTIONS = Object.freeze([
  { key: "all", label: "All categories" },
  ...PLACE_CATEGORY_KEYS.map((key) => ({
    key,
    label: PLACE_CATEGORY_UI[key].label
  }))
]);

export function normalizePlaceCategory(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PLACE_CATEGORY_UI, normalized)
    ? normalized
    : "other";
}

export function isKnownPlaceCategory(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PLACE_CATEGORY_UI, normalized);
}

export function getPlaceCategoryUi(category) {
  return PLACE_CATEGORY_UI[normalizePlaceCategory(category)] || PLACE_CATEGORY_UI.other;
}