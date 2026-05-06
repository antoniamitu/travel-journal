// frontend/src/pages/PostEditorPage.jsx
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

import { api } from "../api/axios.js";
import { createPost, getPostById, updatePost } from "../api/posts.js";
import { cleanupDraftUploads, requestUploadSignature, uploadFileToCloudinary } from "../api/uploads.js";
import ActionDialog from "../components/posts/ActionDialog.jsx";
import PostImagePicker from "../components/posts/PostImagePicker.jsx";
import { useLocationContext } from "../hooks/useLocationContext.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

const MAX_IMAGES = 6;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_CENTER = [45.9432, 24.9668];
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const EMPTY_FORM = {
  title: "",
  content: "",
  latitude: null,
  longitude: null,
  locationName: "",
  city: "",
  country: "",
  displayName: "",
  osmClass: "",
  osmSubtype: "",
  addressType: "",
  privacy: "private"
};

const EMPTY_DIALOG_STATE = {
  type: null,
  imageLocalId: null,
  busy: false,
  mismatchData: null
};

const DEFAULT_PHOTO_MISMATCH_MESSAGE =
  "The photo seems to correspond to a different location than the one selected. Check the location or upload another image.";

const DEFAULT_TEXT_MISMATCH_MESSAGE =
  "Your title or description seems to describe a different location than the one selected.";

const PHOTO_LOCATION_FIELD_ERROR =
  "The selected location doesn't seem to match the uploaded photo.";

const TEXT_LOCATION_FIELD_ERROR =
  "The selected location doesn't seem to match your title or description.";

const EMPTY_PHOTO_SUGGESTION_STATE = {
  status: "idle", // idle | loading | suggested | autofilled | applied | none | error
  suggestion: null,
  reason: "",
  imageKey: ""
};

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidCoordinatePair(lat, lng) {
  return (
    isFiniteNumber(lat) &&
    isFiniteNumber(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function parseCoord(value) {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function nextLocalId() {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getFileExtension(name = "") {
  const idx = String(name).lastIndexOf(".");
  if (idx < 0) return "";
  return String(name).slice(idx + 1).toLowerCase();
}

function isHeicLikeFile(file) {
  const ext = getFileExtension(file?.name || "");
  const type = String(file?.type || "").toLowerCase();
  return ext === "heic" || ext === "heif" || type === "image/heic" || type === "image/heif";
}

function isSupportedImageFile(file) {
  const ext = getFileExtension(file?.name || "");
  const type = String(file?.type || "").toLowerCase();

  const allowedExt = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);
  const allowedMime = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif"
  ]);

  return allowedExt.has(ext) || allowedMime.has(type);
}

function mapPostToForm(post) {
  return {
    title: post?.title || "",
    content: post?.content || "",
    latitude: parseCoord(post?.latitude),
    longitude: parseCoord(post?.longitude),
    locationName: post?.locationName || "",
    city: post?.city || "",
    country: post?.country || "",
    displayName: "",
    osmClass: post?.osmClass || "",
    osmSubtype: post?.osmSubtype || "",
    addressType: post?.addressType || "",
    privacy: post?.privacy || "private"
  };
}

function mapPostImagesToItems(post) {
  const sourceImages = Array.isArray(post?.images) ? post.images : [];
  return sourceImages.map((img, index) => ({
    localId: `existing_${img.id || index}_${img.publicId || index}`,
    source: "existing",
    id: img.id,
    secureUrl: img.secureUrl,
    publicId: img.publicId,
    previewUrl: img.secureUrl,
    status: "uploaded",
    progress: 100,
    error: "",
    file: null,
    fileName: `Image ${index + 1}`
  }));
}

function buildSnapshot(form, images) {
  return JSON.stringify({
    title: form.title,
    content: form.content,
    latitude: form.latitude,
    longitude: form.longitude,
    locationName: form.locationName,
    city: form.city,
    country: form.country,
    displayName: form.displayName,
    osmClass: form.osmClass,
    osmSubtype: form.osmSubtype,
    addressType: form.addressType,
    privacy: form.privacy,
    images: images.map((img) => ({
      source: img.source,
      secureUrl: img.secureUrl || "",
      publicId: img.publicId || ""
    }))
  });
}

function getTitleMessage(value, externalError = "") {
  if (externalError) return { text: externalError, tone: "error" };

  const trimmed = String(value || "").trim();
  if (!trimmed) return { text: "Required • 3-100 characters.", tone: "hint" };
  if (trimmed.length < 3) return { text: "Title must be at least 3 characters.", tone: "error" };
  if (trimmed.length > 100) return { text: "Title cannot exceed 100 characters.", tone: "error" };
  return { text: "Looks good.", tone: "success" };
}

function getContentMessage(value, externalError = "") {
  if (externalError) return { text: externalError, tone: "error" };

  const trimmed = String(value || "").trim();
  if (!trimmed) return { text: "Required • 10-2000 characters.", tone: "hint" };
  if (trimmed.length < 10) return { text: "Content must be at least 10 characters.", tone: "error" };
  if (trimmed.length > 2000) return { text: "Content cannot exceed 2000 characters.", tone: "error" };
  return { text: "Looks good.", tone: "success" };
}

function messageToneClass(tone) {
  if (tone === "error") return "text-rose-600";
  if (tone === "success") return "text-emerald-600";
  return "text-slate-500";
}

function normalizeOptionalText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function toFiniteNumberOrNull(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePhotoMismatchData(data) {
  const verification =
    data?.verification && typeof data.verification === "object" ? data.verification : {};

  return {
    // Keep modal copy controlled by the frontend so this screen stays in one language
    // even if the backend message is localized differently.
    message: DEFAULT_PHOTO_MISMATCH_MESSAGE,
    detectedLandmark:
      normalizeOptionalText(verification.detectedLandmark) ||
      normalizeOptionalText(verification.detectedName),
    confidence: toFiniteNumberOrNull(verification.confidence),
    distanceMeters: toFiniteNumberOrNull(verification.distanceMeters)
  };
}

function normalizeTextMismatchData(data) {
  const consistency =
    data?.consistency && typeof data.consistency === "object" ? data.consistency : {};

  return {
    message: DEFAULT_TEXT_MISMATCH_MESSAGE,
    mentionedLocation: normalizeOptionalText(consistency.mentionedLocation),
    selectedLocation: normalizeOptionalText(consistency.selectedLocation),
    confidence: toFiniteNumberOrNull(consistency.confidence),
    distanceMeters: toFiniteNumberOrNull(consistency.distanceMeters),
    reason: normalizeOptionalText(consistency.reason)
  };
}

function getPrimaryUploadedImage(images) {
  if (!Array.isArray(images)) return null;

  return (
    images.find(
      (item) =>
        item?.status === "uploaded" &&
        String(item?.secureUrl || "").trim() &&
        String(item?.publicId || "").trim()
    ) || null
  );
}

function getPhotoSuggestionImageKey(image) {
  if (!image?.secureUrl || !image?.publicId) return "";
  return `${image.publicId}::${image.secureUrl}`;
}

function normalizePhotoSuggestionData(data) {
  const raw = data?.suggestion && typeof data.suggestion === "object" ? data.suggestion : null;
  if (!raw) return null;

  const lat = Number(raw.lat);
  const lng = Number(raw.lng);

  if (!isValidCoordinatePair(lat, lng)) {
    return null;
  }

  const locationName =
    normalizeOptionalText(raw.locationName) ||
    normalizeOptionalText(raw.displayName) ||
    normalizeOptionalText(raw.detectedName);

  if (!locationName) {
    return null;
  }

  const mode = raw.mode === "autofill" ? "autofill" : "suggest";

  return {
    source: normalizeOptionalText(raw.source) || "vision_nominatim",
    mode,

    detectedName: normalizeOptionalText(raw.detectedName),
    confidence: toFiniteNumberOrNull(raw.confidence),
    detectionLat: toFiniteNumberOrNull(raw.detectionLat),
    detectionLng: toFiniteNumberOrNull(raw.detectionLng),
    distanceMeters: toFiniteNumberOrNull(raw.distanceMeters),

    lat,
    lng,
    locationName,
    city: normalizeOptionalText(raw.city) || "",
    country: normalizeOptionalText(raw.country) || "",
    displayName: normalizeOptionalText(raw.displayName) || locationName,
    osmClass: normalizeOptionalText(raw.osmClass) || "",
    osmSubtype: normalizeOptionalText(raw.osmSubtype) || "",
    addressType: normalizeOptionalText(raw.addressType) || ""
  };
}

function getPhotoSuggestionLabel(suggestion) {
  return suggestion?.locationName || suggestion?.displayName || suggestion?.detectedName || "this place";
}

function isAutoClearableImagesError(value) {
  const message = String(value || "");

  return (
    message === `Maximum ${MAX_IMAGES} images per post. Please remove some images first.` ||
    message === "Please wait until all image uploads finish." ||
    message === "Please retry or remove failed images before saving." ||
    message === "One or more images are missing upload data. Please retry or remove them."
  );
}

function formatMismatchConfidence(confidence) {
  if (!Number.isFinite(confidence)) return null;

  const normalized = confidence >= 0 && confidence <= 1 ? confidence * 100 : confidence;
  return `${Math.round(normalized)}%`;
}

function formatMismatchDistance(distanceMeters) {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return null;

  if (distanceMeters >= 1000) {
    const km = distanceMeters / 1000;
    return km >= 10 ? `${km.toFixed(0)} km` : `${km.toFixed(1)} km`;
  }

  return `${Math.round(distanceMeters)} m`;
}

function getDisplayLabel(item) {
  return item?.locationName || item?.displayName || "";
}

function createSentimentMarkerIcon(sentiment) {
  const color =
    sentiment === "positive"
      ? "#10B981"
      : sentiment === "negative"
        ? "#EF4444"
        : "#F59E0B";

  return L.divIcon({
    className: "",
    iconSize: [34, 44],
    iconAnchor: [17, 44],
    popupAnchor: [0, -38],
    html: `
      <div style="width:34px;height:44px;display:flex;align-items:flex-end;justify-content:center;">
        <svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            d="M17 1C8.716 1 2 7.716 2 16c0 10.624 12.427 24.282 14.246 26.219a1 1 0 0 0 1.508 0C19.573 40.282 32 26.624 32 16 32 7.716 25.284 1 17 1Z"
            fill="${color}"
            stroke="white"
            stroke-width="2"
          />
          <circle cx="17" cy="16" r="5.5" fill="white" opacity="0.95" />
        </svg>
      </div>
    `
  });
}

function MapSyncView({ center, zoom }) {
  const map = useMap();
  const prevKeyRef = useRef("");

  useEffect(() => {
    if (!Array.isArray(center) || center.length !== 2) return;
    if (!Number.isFinite(center[0]) || !Number.isFinite(center[1])) return;

    const key = `${center[0].toFixed(6)},${center[1].toFixed(6)},${zoom}`;
    if (prevKeyRef.current === key) return;
    prevKeyRef.current = key;

    map.flyTo(center, zoom, { duration: 1.2 });
  }, [map, center, zoom]);

  return null;
}

function MapInteraction({ onPick }) {
  useMapEvents({
    click(e) {
      onPick?.(e.latlng);
    }
  });
  return null;
}

function EditorShellCard({ title, children }) {
  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">{title}</h1>
        <div className="mt-4 text-slate-600">{children}</div>
      </div>
    </div>
  );
}

function EditorLoadingSkeleton() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-28 pt-4 md:px-6 md:pb-6 md:pt-6 xl:px-8 xl:pt-8">
      <div className="grid animate-pulse gap-6 lg:grid-cols-[560px_minmax(0,1fr)]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="h-4 w-36 rounded-full bg-slate-200" />
          <div className="mt-3 h-8 w-60 rounded-2xl bg-slate-200" />
          <div className="mt-2 h-4 w-80 rounded-xl bg-slate-100" />

          <div className="mt-8 space-y-5">
            <div className="h-12 rounded-2xl bg-slate-100" />
            <div className="h-14 rounded-2xl bg-slate-100" />
            <div className="h-48 rounded-2xl bg-slate-100" />
            <div className="flex gap-3">
              <div className="h-[118px] w-[118px] rounded-2xl bg-slate-100" />
              <div className="h-[118px] w-[118px] rounded-2xl bg-slate-100" />
              <div className="h-[118px] w-[118px] rounded-2xl bg-slate-100" />
            </div>
            <div className="h-12 rounded-2xl bg-slate-100" />
            <div className="h-28 rounded-2xl bg-slate-100" />
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="px-2 pb-3 pt-1">
            <div className="h-7 w-40 rounded-2xl bg-slate-200" />
            <div className="mt-2 h-4 w-56 rounded-xl bg-slate-100" />
          </div>
          <div className="overflow-hidden rounded-[24px] border border-slate-200">
            <div className="h-[360px] bg-slate-100 sm:h-[420px] md:h-[520px] lg:h-[680px]" />
          </div>
        </section>
      </div>
    </div>
  );
}

function LocationAutocomplete({
  value,
  disabled = false,
  searchSuppression = null,
  onValueChange,
  onSelectPlace
}) {
  const inputId = useId();
  const listboxId = useId();

  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const abortRef = useRef(null);
  const requestIdRef = useRef(0);
  const suppressSearchForQueryRef = useRef("");
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const debouncedQuery = useDebouncedValue(value, 450);
  const trimmed = value.trim();
  const debouncedTrimmed = debouncedQuery.trim();
  const canSearch = debouncedTrimmed.length >= 3;

  const showDropdown = useMemo(() => {
    if (!isOpen) return false;
    return isLoading || Boolean(error) || items.length > 0 || (hasSearched && items.length === 0);
  }, [isOpen, isLoading, error, items.length, hasSearched]);

  const activeOptionId = useMemo(() => {
    if (activeIndex < 0 || activeIndex >= items.length) return undefined;
    return `${listboxId}-opt-${activeIndex}`;
  }, [activeIndex, items.length, listboxId]);

  useEffect(() => {
    function onPointerDown(e) {
      if (!wrapRef.current?.contains(e.target)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }

    function onKeyDown(e) {
      if (e.key === "Escape") {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }

    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);


  useEffect(() => {
    const query = String(searchSuppression?.value || "").trim();
    if (!query) return;

    suppressSearchForQueryRef.current = query;
    requestIdRef.current += 1;

    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    setItems([]);
    setError("");
    setHasSearched(false);
    setIsLoading(false);
    setIsOpen(false);
    setActiveIndex(-1);
  }, [searchSuppression?.seq, searchSuppression?.value]);

  useEffect(() => {
    const suppressedQuery = suppressSearchForQueryRef.current;

    if (suppressedQuery) {
      if (debouncedTrimmed === suppressedQuery) {
        suppressSearchForQueryRef.current = "";
        setItems([]);
        setError("");
        setHasSearched(false);
        setIsLoading(false);
        setIsOpen(false);
        setActiveIndex(-1);
        return;
      }

      suppressSearchForQueryRef.current = "";
    }

    const requestId = (requestIdRef.current += 1);

    if (!canSearch || disabled) {
      setItems([]);
      setHasSearched(false);
      setError("");

      if (abortRef.current) abortRef.current.abort();
      abortRef.current = null;

      setIsLoading(false);
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    let cancelled = false;

    setIsOpen(true);

    if (abortRef.current) abortRef.current.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError("");
    setHasSearched(true);

    (async () => {
      try {
        const res = await api.post(
          "/geocode/search",
          { query: debouncedTrimmed },
          { timeout: 15000, signal: controller.signal }
        );

        if (cancelled || requestId !== requestIdRef.current) {
          return;
        }

        const results = Array.isArray(res?.data?.results) ? res.data.results : [];
        setItems(results);
        setActiveIndex(results.length > 0 ? 0 : -1);
      } catch (err) {
        if (
          err?.name === "CanceledError" ||
          err?.code === "ERR_CANCELED" ||
          err?.name === "AbortError"
        ) {
          return;
        }

        if (cancelled || requestId !== requestIdRef.current) {
          return;
        }

        const status = err?.response?.status;
        const message = err?.response?.data?.message;

        if (status === 429) setError(message || "Too many requests. Please slow down.");
        else if (status === 503) setError(message || "Geocoding service busy. Try again shortly.");
        else setError("Search failed. Please try again.");

        setItems([]);
        setActiveIndex(-1);
      } finally {
          if (!cancelled && requestId === requestIdRef.current) {
            setIsLoading(false);
          }

          if (abortRef.current === controller) {
            abortRef.current = null;
          }
        }
    })();

    return () => {
      cancelled = true;
      controller.abort();

      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    };
  }, [debouncedTrimmed, canSearch, disabled]);

  function handleSelect(item) {
    const label = getDisplayLabel(item);

    suppressSearchForQueryRef.current = label.trim();
    requestIdRef.current += 1;

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;

    onValueChange(label);
    onSelectPlace?.(item);

    setItems([]);
    setError("");
    setHasSearched(false);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e) {
    if (!showDropdown) {
      if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp") && trimmed.length >= 3) {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!items.length) return;
      setActiveIndex((prev) => (prev < 0 ? 0 : Math.min(prev + 1, items.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      setActiveIndex((prev) => (prev < 0 ? items.length - 1 : Math.max(prev - 1, 0)));
    } else if (e.key === "Home") {
      e.preventDefault();
      if (items.length) setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      if (items.length) setActiveIndex(items.length - 1);
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < items.length) {
        e.preventDefault();
        handleSelect(items[activeIndex]);
      }
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
          📍
        </span>

        <input
          id={inputId}
          ref={inputRef}
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => {
            onValueChange(e.target.value);
            setError("");
            if (!isOpen && e.target.value.trim().length >= 3) setIsOpen(true);
          }}
          onFocus={() => {
            if (value.trim().length >= 3) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search a place, or use GPS / map"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-activedescendant={activeOptionId}
          aria-busy={isLoading || undefined}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-11 py-3 pr-11 text-base text-slate-900 placeholder:text-slate-400 sm:text-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100"
        />

        {value.trim().length > 0 && !disabled && (
          <button
            type="button"
            onClick={() => {
              suppressSearchForQueryRef.current = "";
              requestIdRef.current += 1;
              if (abortRef.current) abortRef.current.abort();
              abortRef.current = null;

              onValueChange("");
              setItems([]);
              setError("");
              setHasSearched(false);
              setIsOpen(false);
              setActiveIndex(-1);

              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            aria-label="Clear location search"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 z-[1300] mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          {isLoading && <div className="px-4 py-3 text-sm text-slate-500">Searching…</div>}

          {error && <div className="px-4 py-3 text-sm text-rose-600">{error}</div>}

          {!error && !isLoading && (
            <ul id={listboxId} role="listbox" aria-label="Places" className="m-0 list-none p-0">
              {items.map((item, idx) => {
                const isActive = idx === activeIndex;
                const optionId = `${listboxId}-opt-${idx}`;

                return (
                  <li key={`${item.lat}-${item.lng}-${item.displayName || idx}`} role="presentation">
                    <button
                      id={optionId}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => handleSelect(item)}
                      className={[
                        "block w-full px-4 py-3 text-left text-sm transition",
                        isActive ? "bg-slate-100" : "hover:bg-slate-100"
                      ].join(" ")}
                    >
                      <div className="font-medium text-slate-900">{getDisplayLabel(item)}</div>
                      {(item.city || item.country) && (
                        <div className="text-xs text-slate-500">
                          {[item.city, item.country].filter(Boolean).join(", ")}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}

              {hasSearched && items.length === 0 && (
                <li className="px-4 py-3 text-sm text-slate-500">
                  No locations found for &quot;{debouncedTrimmed}&quot;
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function PostEditorPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);

  const navigate = useNavigate();
  const { setSelectedPlace, clearSelectedPlace } = useLocationContext();

  const [pageStatus, setPageStatus] = useState(isEdit ? "loading" : "ready");
  const [form, setForm] = useState(EMPTY_FORM);
  const [images, setImages] = useState([]);
  const [savedSentiment, setSavedSentiment] = useState("neutral");
  const [fieldErrors, setFieldErrors] = useState({});
  const [locationQuery, setLocationQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUsingGps, setIsUsingGps] = useState(false);
  const [reverseStatus, setReverseStatus] = useState("");
  const [dialogState, setDialogState] = useState(EMPTY_DIALOG_STATE);
  const [photoSuggestionState, setPhotoSuggestionState] = useState(EMPTY_PHOTO_SUGGESTION_STATE);
  const [locationSearchSuppression, setLocationSearchSuppression] = useState({
    value: "",
    seq: 0
  });

  const initialSnapshotRef = useRef(buildSnapshot(EMPTY_FORM, []));
  const loadAbortRef = useRef(null);
  const reverseAbortRef = useRef(null);
  const reverseReqIdRef = useRef(0);
  const submitAbortRef = useRef(null);
  const photoSuggestionAbortRef = useRef(null);
  const uploadControllersRef = useRef({});
  const imagesRef = useRef(images);

  const photoSuggestionAttemptedImageKeyRef = useRef("");
  const manualLocationSelectedRef = useRef(false);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      if (loadAbortRef.current) loadAbortRef.current.abort();
      if (reverseAbortRef.current) reverseAbortRef.current.abort();
      if (submitAbortRef.current) submitAbortRef.current.abort();
      if (photoSuggestionAbortRef.current) photoSuggestionAbortRef.current.abort();

      Object.values(uploadControllersRef.current).forEach((controller) => {
        if (controller && typeof controller.abort === "function") {
          controller.abort();
        }
      });

      imagesRef.current.forEach((item) => {
        if (item?.previewUrl?.startsWith?.("blob:")) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, []);

  useEffect(() => {
    if (!isEdit) {
      clearSelectedPlace();
      setForm(EMPTY_FORM);
      setImages([]);
      setSavedSentiment("neutral");
      setLocationQuery("");
      setFieldErrors({});
      setReverseStatus("");
      setDialogState(EMPTY_DIALOG_STATE);
      setPhotoSuggestionState(EMPTY_PHOTO_SUGGESTION_STATE);
      setLocationSearchSuppression({ value: "", seq: 0 });

      photoSuggestionAttemptedImageKeyRef.current = "";
      manualLocationSelectedRef.current = false;

      if (photoSuggestionAbortRef.current) {
        photoSuggestionAbortRef.current.abort();
        photoSuggestionAbortRef.current = null;
      }

      initialSnapshotRef.current = buildSnapshot(EMPTY_FORM, []);
      setPageStatus("ready");
    }
  }, [isEdit, clearSelectedPlace]);

  const hasUploadingImages = useMemo(
    () => images.some((item) => item.status === "uploading"),
    [images]
  );

  const hasErroredImages = useMemo(
    () => images.some((item) => item.status === "error"),
    [images]
  );

  const hasResolvedLocation = useMemo(() => {
    return (
      isValidCoordinatePair(form.latitude, form.longitude) &&
      Boolean(form.locationName.trim())
    );
  }, [form.latitude, form.longitude, form.locationName]);

  const hasUploadedImages = useMemo(
    () => images.some((item) => item.status === "uploaded"),
    [images]
  );

  const primaryUploadedImage = useMemo(() => getPrimaryUploadedImage(images), [images]);
  const primaryUploadedImageKey = useMemo(
    () => getPhotoSuggestionImageKey(primaryUploadedImage),
    [primaryUploadedImage]
  );

const nonLocationControlsDisabled = isSubmitting;

  const previewSentiment = isEdit ? savedSentiment : "neutral";
  const sentimentMarkerIcon = useMemo(
    () => createSentimentMarkerIcon(previewSentiment),
    [previewSentiment]
  );

  const mapCenter = useMemo(() => {
    if (isValidCoordinatePair(form.latitude, form.longitude)) {
      return [form.latitude, form.longitude];
    }

    return DEFAULT_CENTER;
  }, [form.latitude, form.longitude]);

  const mapZoom = useMemo(() => {
    if (isValidCoordinatePair(form.latitude, form.longitude)) return 13;
    return 6;
  }, [form.latitude, form.longitude]);

  const isDirty = useMemo(() => {
    return buildSnapshot(form, images) !== initialSnapshotRef.current;
  }, [form, images]);

  const localValidationErrors = useMemo(() => {
    const next = {};
    const titleLen = form.title.trim().length;
    const contentLen = form.content.trim().length;

    if (!hasResolvedLocation) {
      next.locationName = "Please select a location";
    }

    if (titleLen < 3) {
      next.title = "Title must be at least 3 characters";
    } else if (titleLen > 100) {
      next.title = "Title cannot exceed 100 characters";
    }

    if (contentLen < 10) {
      next.content = "Content must be at least 10 characters";
    } else if (contentLen > 2000) {
      next.content = "Content cannot exceed 2000 characters";
    }

    if (images.length > MAX_IMAGES) {
      next.images = `Maximum ${MAX_IMAGES} images per post. Please remove some images first.`;
    } else if (hasUploadingImages) {
      next.images = "Please wait until all image uploads finish.";
    } else if (hasErroredImages) {
      next.images = "Please retry or remove failed images before saving.";
    }

    return next;
  }, [form, images.length, hasUploadingImages, hasErroredImages, hasResolvedLocation]);

 useEffect(() => {
    if (!localValidationErrors.images && isAutoClearableImagesError(fieldErrors.images)) {
      setFieldErrors((prev) => {
        if (!isAutoClearableImagesError(prev.images)) return prev;

        return {
          ...prev,
          images: ""
        };
      });
    }
  }, [localValidationErrors.images, fieldErrors.images]);

  const canSubmit = useMemo(() => {
    return !isSubmitting && Object.keys(localValidationErrors).length === 0;
  }, [isSubmitting, localValidationErrors]);

  const titleMessage = useMemo(
    () => getTitleMessage(form.title, fieldErrors.title),
    [form.title, fieldErrors.title]
  );

  const contentMessage = useMemo(
    () => getContentMessage(form.content, fieldErrors.content),
    [form.content, fieldErrors.content]
  );

  const applyPlaceToForm = useCallback((place, fallbackLabel = "") => {
    if (!place) return;

    const lat = Number(place.lat);
    const lng = Number(place.lng);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return;
    }

    const locationName =
      String(place.locationName || "").trim() ||
      String(place.displayName || "").trim() ||
      fallbackLabel;

    setForm((prev) => ({
      ...prev,
      latitude: lat,
      longitude: lng,
      locationName,
      city: place.city || "",
      country: place.country || "",
      displayName: String(place.displayName || "").trim(),
      osmClass: String(place.osmClass || "").trim(),
      osmSubtype: String(place.osmSubtype || "").trim(),
      addressType: String(place.addressType || "").trim()
    }));

    setLocationSearchSuppression((prev) => ({
      value: locationName,
      seq: prev.seq + 1
    }));

    setLocationQuery(locationName);
    setFieldErrors((prev) => ({
      ...prev,
      locationName: ""
    }));
  }, []);

  const markPhotoSuggestionAsNotApplied = useCallback(() => {
    if (photoSuggestionAbortRef.current) {
      photoSuggestionAbortRef.current.abort();
      photoSuggestionAbortRef.current = null;
    }

    setPhotoSuggestionState((prev) => {
      if (prev.status === "loading") {
        return EMPTY_PHOTO_SUGGESTION_STATE;
      }

      if (
        prev.suggestion &&
        (prev.status === "autofilled" || prev.status === "applied")
      ) {
        return {
          ...prev,
          status: "suggested"
        };
      }

      return prev;
    });
  }, []);

  useEffect(() => {
    if (isEdit || isSubmitting) return;

    if (!primaryUploadedImage || !primaryUploadedImageKey) {
    photoSuggestionAttemptedImageKeyRef.current = "";

    if (photoSuggestionAbortRef.current) {
      photoSuggestionAbortRef.current.abort();
      photoSuggestionAbortRef.current = null;
    }

    setPhotoSuggestionState((prev) =>
      prev.status === "idle" ? prev : EMPTY_PHOTO_SUGGESTION_STATE
    );

    return;
  }

  if (photoSuggestionAttemptedImageKeyRef.current === primaryUploadedImageKey) return;
  if (hasResolvedLocation || locationQuery.trim()) return;

  photoSuggestionAttemptedImageKeyRef.current = primaryUploadedImageKey;
  if (photoSuggestionAbortRef.current) {
    photoSuggestionAbortRef.current.abort();
  }

  const controller = new AbortController();
  photoSuggestionAbortRef.current = controller;

  let cancelled = false;

  setPhotoSuggestionState({
    status: "loading",
    suggestion: null,
    reason: "",
    imageKey: primaryUploadedImageKey
  });

  (async () => {
    try {
      const res = await api.post(
        "/geocode/photo-suggestion",
        {
          imageUrl: primaryUploadedImage.secureUrl,
          publicId: primaryUploadedImage.publicId
        },
        {
          timeout: 30000,
          signal: controller.signal
        }
      );

      if (cancelled) return;

      const suggestion = normalizePhotoSuggestionData(res?.data);

      if (!suggestion) {
        setPhotoSuggestionState({
          status: "none",
          suggestion: null,
          reason: res?.data?.reason || "no_suggestion",
          imageKey: primaryUploadedImageKey
        });
        return;
      }

      const shouldAutofill =
        suggestion.mode === "autofill" &&
        !manualLocationSelectedRef.current &&
        !hasResolvedLocation &&
        !locationQuery.trim();

      if (shouldAutofill) {
        applyPlaceToForm(suggestion);

        setPhotoSuggestionState({
          status: "autofilled",
          suggestion,
          reason: "",
          imageKey: primaryUploadedImageKey
        });

        toast.success(`Location suggested from your photo: ${getPhotoSuggestionLabel(suggestion)}`);
        return;
      }

      setPhotoSuggestionState({
        status: "suggested",
        suggestion,
        reason: "",
        imageKey: primaryUploadedImageKey
      });
    } catch (err) {
      if (
        err?.name === "CanceledError" ||
        err?.code === "ERR_CANCELED" ||
        err?.name === "AbortError"
      ) {
        return;
      }

      setPhotoSuggestionState({
        status: "error",
        suggestion: null,
        reason: err?.response?.data?.message || "photo_suggestion_failed",
        imageKey: primaryUploadedImageKey
      });
    } finally {
      if (photoSuggestionAbortRef.current === controller) {
        photoSuggestionAbortRef.current = null;
      }
    }
  })();

  return () => {
    cancelled = true;
    controller.abort();

    if (photoSuggestionAbortRef.current === controller) {
      photoSuggestionAbortRef.current = null;
    }
  };
}, [
  applyPlaceToForm,
  hasResolvedLocation,
  isEdit,
  isSubmitting,
  locationQuery,
  primaryUploadedImage,
  primaryUploadedImageKey
]);

  const clearResolvedLocation = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      latitude: null,
      longitude: null,
      locationName: "",
      city: "",
      country: "",
      displayName: "",
      osmClass: "",
      osmSubtype: "",
      addressType: ""
    }));
    setFieldErrors((prev) => ({
      ...prev,
      locationName: ""
    }));
    setReverseStatus("");
  }, []);

  const setImageByLocalId = useCallback((localId, updater) => {
    setImages((prev) =>
      prev.map((item) => {
        if (item.localId !== localId) return item;
        return typeof updater === "function" ? updater(item) : { ...item, ...updater };
      })
    );
  }, []);

  const removeImageImmediately = useCallback((localId) => {
    setImages((prev) => {
      const target = prev.find((item) => item.localId === localId);
      if (target?.previewUrl?.startsWith?.("blob:")) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.localId !== localId);
    });
  }, []);

  const bestEffortCleanupPublicIds = useCallback(async (publicIds) => {
    const ids = Array.isArray(publicIds) ? publicIds.filter(Boolean) : [];
    if (ids.length === 0) return;

    try {
      await cleanupDraftUploads(ids);
    } catch {
      // best effort only
    }
  }, []);

  const reverseGeocode = useCallback(async (lat, lng, signal) => {
    const res = await api.post("/geocode/reverse", { lat, lng }, { timeout: 15000, signal });
    return res?.data?.result || null;
  }, []);

  const resolveLocationFromCoords = useCallback(
    async (lat, lng, { fallbackLabel = "Dropped pin" } = {}) => {
      manualLocationSelectedRef.current = true;
      markPhotoSuggestionAsNotApplied();

      const numericLat = Number(lat);
      const numericLng = Number(lng);

    if (
      !Number.isFinite(numericLat) ||
      !Number.isFinite(numericLng) ||
      numericLat < -90 ||
      numericLat > 90 ||
      numericLng < -180 ||
      numericLng > 180
    ) {
      toast.error("Invalid map coordinates. Please try selecting the location again.");
      return;
    }

    setForm((prev) => ({
      ...prev,
      latitude: numericLat,
      longitude: numericLng,
      locationName: "",
      city: "",
      country: "",
      displayName: "",
      osmClass: "",
      osmSubtype: "",
      addressType: ""
    }));

    setLocationQuery("");
    setFieldErrors((prev) => ({
      ...prev,
      locationName: ""
    }));

    setReverseStatus("Looking up location…");

      if (reverseAbortRef.current) reverseAbortRef.current.abort();
      reverseAbortRef.current = new AbortController();

      const reqId = (reverseReqIdRef.current += 1);

      try {
        const result = await reverseGeocode(numericLat, numericLng, reverseAbortRef.current.signal);

        if (reqId !== reverseReqIdRef.current) return;

        if (result) {
          applyPlaceToForm(result, fallbackLabel);
          setReverseStatus("");
        } else {
          const fallbackPlace = {
            lat: numericLat,
            lng: numericLng,
            locationName: fallbackLabel,
            displayName: fallbackLabel,
            city: "",
            country: "",
            osmClass: "",
            osmSubtype: "",
            addressType: ""
          };
          applyPlaceToForm(fallbackPlace, fallbackLabel);
          setReverseStatus("Could not resolve an address. Using dropped pin.");
        }
      } catch (err) {
        if (
          err?.name === "CanceledError" ||
          err?.code === "ERR_CANCELED" ||
          err?.name === "AbortError"
        ) {
          return;
        }

        if (reqId !== reverseReqIdRef.current) return;

        const fallbackPlace = {
          lat: numericLat,
          lng: numericLng,
          locationName: fallbackLabel,
          displayName: fallbackLabel,
          city: "",
          country: "",
          osmClass: "",
          osmSubtype: "",
          addressType: ""
        };

        applyPlaceToForm(fallbackPlace, fallbackLabel);

        const status = err?.response?.status;
        const message = err?.response?.data?.message;

        if (status === 429) {
          setReverseStatus(message || "Too many requests. Please slow down.");
          toast.error(message || "Too many requests. Please slow down.");
        } else if (status === 503) {
          setReverseStatus(message || "Geocoding service busy. Try again shortly.");
          toast.error(message || "Geocoding service busy. Try again shortly.");
        } else {
          setReverseStatus("Could not resolve an address. Using dropped pin.");
          toast.error("Reverse geocoding failed. Using dropped pin.");
        }
      } finally {
          if (reqId === reverseReqIdRef.current) {
            reverseAbortRef.current = null;
          }
        }
    },
    [applyPlaceToForm, markPhotoSuggestionAsNotApplied, reverseGeocode]
  );

  const uploadOneImage = useCallback(
    async (localId, file) => {
      const controller = new AbortController();
      uploadControllersRef.current[localId] = controller;

      try {
        const signed = await requestUploadSignature({ signal: controller.signal });

        const uploaded = await uploadFileToCloudinary(file, signed, {
          signal: controller.signal,
          onProgress: (percent) => {
            setImageByLocalId(localId, (current) => ({
              ...current,
              progress: clamp(percent, 0, 100)
            }));
          }
        });

        setImageByLocalId(localId, (current) => ({
          ...current,
          status: "uploaded",
          progress: 100,
          secureUrl: uploaded.secureUrl,
          publicId: uploaded.publicId,
          error: ""
        }));
      } catch (err) {
        if (
          err?.name === "CanceledError" ||
          err?.code === "ERR_CANCELED" ||
          err?.name === "AbortError"
        ) {
          return;
        }

        let message = "Failed to upload image. Please try again.";
        if (isHeicLikeFile(file)) {
          message =
            "Failed to upload image. HEIC/HEIF may not be supported on this device or provider.";
        }

        setImageByLocalId(localId, (current) => ({
          ...current,
          status: "error",
          error: message
        }));
      } finally {
          delete uploadControllersRef.current[localId];
        }
      },
    [setImageByLocalId]
  );

  useEffect(() => {
    if (!isEdit) return;

    let cancelled = false;
    if (loadAbortRef.current) loadAbortRef.current.abort();
    loadAbortRef.current = new AbortController();

    async function loadPost() {
      setPageStatus("loading");

      try {
        const post = await getPostById(id, { signal: loadAbortRef.current.signal });

        if (cancelled) return;

        if (!post) {
          toast.error("This post doesn't exist or has been deleted.");
          setPageStatus("redirecting");
          navigate("/map", { replace: true });
          return;
        }

        if (!post.isOwner) {
          toast.error("You can't edit this post.");
          setPageStatus("redirecting");
          navigate(`/posts/${id}`, { replace: true });
          return;
        }

        const nextForm = mapPostToForm(post);
        const nextImages = mapPostImagesToItems(post);

        setForm(nextForm);
        setImages(nextImages);
        setSavedSentiment(post?.sentiment || "neutral");
        const loadedLocationQuery = nextForm.locationName || "";

        setLocationSearchSuppression((prev) => ({
          value: loadedLocationQuery,
          seq: prev.seq + 1
        }));

        setLocationQuery(loadedLocationQuery);
        setFieldErrors({});
        setReverseStatus("");
        setPhotoSuggestionState(EMPTY_PHOTO_SUGGESTION_STATE);

        photoSuggestionAttemptedImageKeyRef.current = "__edit_mode__";
        manualLocationSelectedRef.current = true;

        initialSnapshotRef.current = buildSnapshot(nextForm, nextImages);
        setPageStatus("ready");
      } catch (err) {
        if (
          err?.name === "CanceledError" ||
          err?.code === "ERR_CANCELED" ||
          err?.name === "AbortError"
        ) {
          return;
        }

        if (cancelled) return;

        const status = err?.response?.status;

        if (status === 404) {
          toast.error("This post doesn't exist or you can't access it.");
          setPageStatus("redirecting");
          navigate("/map", { replace: true });
          return;
        }

        setPageStatus("error");
      }
    }

    loadPost();

    return () => {
      cancelled = true;
      if (loadAbortRef.current) loadAbortRef.current.abort();
    };
  }, [id, isEdit, navigate]);

  const requestImageRemoval = useCallback(
    (localId) => {
      if (nonLocationControlsDisabled) return;
      setDialogState({
        type: "remove-image",
        imageLocalId: localId,
        busy: false,
        mismatchData: null
      });
    },
    [nonLocationControlsDisabled]
  );

  const handleConfirmRemoveImage = useCallback(async () => {
    const localId = dialogState.imageLocalId;
    if (!localId) return;

    setDialogState((prev) => ({ ...prev, busy: true, mismatchData: null }));

    const target = imagesRef.current.find((item) => item.localId === localId);
    if (!target) {
      setDialogState(EMPTY_DIALOG_STATE);
      return;
    }

    const controller = uploadControllersRef.current[localId];
    if (controller) {
      controller.abort();
      delete uploadControllersRef.current[localId];
    }

    const publicIdToCleanup =
  target.source === "new" && target.publicId && target.status === "uploaded"
    ? [target.publicId]
    : [];

  const removedImageKey = getPhotoSuggestionImageKey(target);

  setPhotoSuggestionState((prev) => {
    if (removedImageKey && prev.imageKey === removedImageKey) {
      photoSuggestionAttemptedImageKeyRef.current = "";
      if (photoSuggestionAbortRef.current) {
        photoSuggestionAbortRef.current.abort();
        photoSuggestionAbortRef.current = null;
      }

      return EMPTY_PHOTO_SUGGESTION_STATE;
    }

    return prev;
  });

  removeImageImmediately(localId);
  await bestEffortCleanupPublicIds(publicIdToCleanup);

  setDialogState(EMPTY_DIALOG_STATE);
  }, [bestEffortCleanupPublicIds, dialogState.imageLocalId, removeImageImmediately]);

  const handleRetryImage = useCallback(
    async (localId) => {
      if (nonLocationControlsDisabled) return;

      const target = imagesRef.current.find((item) => item.localId === localId);
      if (!target?.file) return;

      setImageByLocalId(localId, (current) => ({
        ...current,
        status: "uploading",
        progress: 0,
        error: ""
      }));

      await uploadOneImage(localId, target.file);
    },
    [nonLocationControlsDisabled, setImageByLocalId, uploadOneImage]
  );

  const handleFilesSelected = useCallback(
    (files) => {
      if (nonLocationControlsDisabled) return;
      if (!Array.isArray(files) || files.length === 0) return;

      let availableSlots = MAX_IMAGES - imagesRef.current.length;
      if (availableSlots <= 0) {
        setFieldErrors((prev) => ({
          ...prev,
          images: `Maximum ${MAX_IMAGES} images per post. Please remove some images first.`
        }));
        toast.error(`Maximum ${MAX_IMAGES} images per post. Please remove some images first.`);
        return;
      }

      const nextItems = [];

      for (const file of files) {
        if (availableSlots <= 0) {
          toast.error(`Maximum ${MAX_IMAGES} images per post. Please remove some images first.`);
          break;
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
          toast.error("Image exceeds 5MB. Please choose a smaller image.");
          continue;
        }

        if (!isSupportedImageFile(file)) {
          toast.error("Unsupported file format. Please upload JPEG, PNG, WebP, HEIC, or HEIF.");
          if (isHeicLikeFile(file)) {
            toast.error(
              "Tip: HEIC photos may not be supported everywhere. Convert to JPEG or try another file."
            );
          }
          continue;
        }

        const localId = nextLocalId();
        const previewUrl = URL.createObjectURL(file);

        nextItems.push({
          localId,
          source: "new",
          id: null,
          secureUrl: "",
          publicId: "",
          previewUrl,
          status: "uploading",
          progress: 0,
          error: "",
          file,
          fileName: file.name
        });

        availableSlots -= 1;
      }

      if (nextItems.length === 0) return;

      setFieldErrors((prev) => ({
        ...prev,
        images: ""
      }));

      setImages((prev) => [...prev, ...nextItems]);
      nextItems.forEach((item) => {
        uploadOneImage(item.localId, item.file);
      });
    },
    [nonLocationControlsDisabled, uploadOneImage]
  );

  const handleUseGps = useCallback(async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported on this device.");
      return;
    }

    setIsUsingGps(true);

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        });
      });

      const lat = position?.coords?.latitude;
      const lng = position?.coords?.longitude;

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error("Invalid coordinates from geolocation.");
      }

      await resolveLocationFromCoords(lat, lng, { fallbackLabel: "Current location" });
    } catch (err) {
      const code = err?.code;
      if (code === 1) {
        toast.error("Location permission was denied.");
      } else if (code === 2) {
        toast.error("Your location could not be determined.");
      } else if (code === 3) {
        toast.error("Location request timed out.");
      } else {
        toast.error("Failed to get your current location.");
      }
    } finally {
        setIsUsingGps(false);
      }
  }, [resolveLocationFromCoords]);

  const handleDiscard = useCallback(async () => {
    setDialogState((prev) => ({ ...prev, busy: true, mismatchData: null }));

    Object.values(uploadControllersRef.current).forEach((controller) => {
      if (controller && typeof controller.abort === "function") {
        controller.abort();
      }
    });
    uploadControllersRef.current = {};

    const unsavedIds = imagesRef.current
      .filter((item) => item.source === "new" && item.status === "uploaded" && item.publicId)
      .map((item) => item.publicId);

    await bestEffortCleanupPublicIds(unsavedIds);

    setDialogState(EMPTY_DIALOG_STATE);

    if (isEdit) {
      navigate(`/posts/${id}`);
    } else {
      clearSelectedPlace();
      navigate("/map");
    }
  }, [bestEffortCleanupPublicIds, clearSelectedPlace, id, isEdit, navigate]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();

      const clientErrors = localValidationErrors;
      setFieldErrors(clientErrors);

      if (Object.keys(clientErrors).length > 0) {
        toast.error("Please fix the highlighted fields before saving.");
        return;
      }

      const submittedImages = images.map((item) => ({
        secureUrl: String(item.secureUrl || "").trim(),
        publicId: String(item.publicId || "").trim()
      }));

      const hasInvalidUploadedImage = submittedImages.some(
        (item) => !item.secureUrl || !item.publicId
      );

      if (hasInvalidUploadedImage) {
        setFieldErrors((prev) => ({
          ...prev,
          images: "One or more images are missing upload data. Please retry or remove them."
        }));
        toast.error("One or more images are missing upload data. Please retry or remove them.");
        return;
      }

      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        latitude: form.latitude,
        longitude: form.longitude,
        locationName: form.locationName.trim(),
        city: form.city?.trim() || "",
        country: form.country?.trim() || "",
        displayName: form.displayName?.trim() || "",
        osmClass: form.osmClass?.trim() || "",
        osmSubtype: form.osmSubtype?.trim() || "",
        addressType: form.addressType?.trim() || "",
        privacy: form.privacy,
        images: submittedImages
      };

      setIsSubmitting(true);
      let didNavigate = false;
      setFieldErrors({});

      if (submitAbortRef.current) submitAbortRef.current.abort();

      const controller = new AbortController();
      submitAbortRef.current = controller;

      try {
        const savedPost = isEdit
          ? await updatePost(id, payload, { signal: controller.signal })
          : await createPost(payload, { signal: controller.signal });

        if (!savedPost?.id) {
          throw new Error("Invalid saved post response.");
        }

        toast.success(isEdit ? "Post updated successfully!" : "Post created successfully!");

        if (isEdit) {
          didNavigate = true;
          navigate("/map", { replace: true });
        } else {
          const savedLat = Number(savedPost.latitude);
          const savedLng = Number(savedPost.longitude);

          setSelectedPlace(
            {
              lat: Number.isFinite(savedLat) ? savedLat : payload.latitude,
              lng: Number.isFinite(savedLng) ? savedLng : payload.longitude,
              locationName: savedPost.locationName || payload.locationName,
              displayName: form.displayName?.trim() || savedPost.locationName || payload.locationName,
              city: savedPost.city || payload.city || "",
              country: savedPost.country || payload.country || "",
              osmClass: form.osmClass?.trim() || "",
              osmSubtype: form.osmSubtype?.trim() || "",
              addressType: form.addressType?.trim() || ""
            },
            "post-create"
          );

          didNavigate = true;
          navigate("/map", { replace: true });
        }
      } catch (err) {
        if (
          err?.name === "CanceledError" ||
          err?.code === "ERR_CANCELED" ||
          err?.name === "AbortError"
        ) {
          return;
        }

        const status = err?.response?.status;
        const data = err?.response?.data;
        const backendErrors = data?.errors && typeof data.errors === "object" ? data.errors : null;

        if (backendErrors) {
          setFieldErrors((prev) => ({
            ...prev,
            ...backendErrors
          }));
        }

        const isPhotoLocationMismatch = status === 422 && data?.code === "PHOTO_LOCATION_MISMATCH";

        if (isPhotoLocationMismatch) {
          const mismatchData = normalizePhotoMismatchData(data);

          setFieldErrors((prev) => ({
            ...prev,
            ...backendErrors,
            locationName:
              backendErrors?.locationName || PHOTO_LOCATION_FIELD_ERROR
          }));

          setDialogState({
            type: "photo-location-mismatch",
            imageLocalId: null,
            busy: false,
            mismatchData
          });

          return;
        }

        const isTextLocationMismatch = status === 422 && data?.code === "TEXT_LOCATION_MISMATCH";

        if (isTextLocationMismatch) {
          const mismatchData = normalizeTextMismatchData(data);

          setFieldErrors((prev) => ({
            ...prev,
            ...backendErrors,
            locationName:
              backendErrors?.locationName || TEXT_LOCATION_FIELD_ERROR
          }));

          setDialogState({
            type: "text-location-mismatch",
            imageLocalId: null,
            busy: false,
            mismatchData
          });

          return;
        }

        if (status === 401) {
          toast.error("Session expired. Please login again.");
        } else if (status === 404) {
          toast.error(isEdit ? "This post doesn't exist or has been deleted." : "Route not found.");

          if (isEdit) {
            didNavigate = true;
            navigate("/map", { replace: true });
          }
        } else if (status === 409) {
          toast.error(data?.message || "One or more images are already used by another post.");
        } else if (data?.message) {
          toast.error(data.message);
        } else {
          toast.error(
            isEdit ? "Failed to update post. Please try again." : "Failed to create post. Please try again."
          );
        }
      } finally {
          if (!didNavigate) {
            setIsSubmitting(false);
          }

        if (submitAbortRef.current === controller) {
          submitAbortRef.current = null;
        }
      }
    },
    [form, id, images, isEdit, localValidationErrors, navigate, setSelectedPlace]
  );

  if (pageStatus === "loading") {
    return <EditorLoadingSkeleton />;
  }

  if (pageStatus === "redirecting") {
    return null;
  }

  if (pageStatus === "error") {
    return (
      <EditorShellCard title={isEdit ? "Edit Memory" : "Create New Memory"}>
        <p>We couldn't open the editor right now.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/map"
            className="inline-flex items-center rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Back to Map
          </Link>
          {isEdit && (
            <Link
              to={`/posts/${id}`}
              className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Back to Post
            </Link>
          )}
        </div>
      </EditorShellCard>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-[1600px] px-4 pb-28 pt-4 md:px-6 md:pb-6 md:pt-6 xl:px-8 xl:pt-8">
        <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[560px_minmax(0,1fr)]">
          <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div>
              <div className="text-[13px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                {isEdit ? "Edit Journey Entry" : "New Journey Entry"}
              </div>
              <h1 className="mt-2 text-2xl font-semibold text-slate-900">
                {isEdit ? "Edit Memory" : "Create New Memory"}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Add a photo if you have one, write your memory, then choose the location that best matches it.
              </p>
            </div>

            <div className="mt-6 space-y-6">
              <div>
                <PostImagePicker
                  items={images}
                  maxCount={MAX_IMAGES}
                  onFilesSelected={handleFilesSelected}
                  onRequestRemove={requestImageRemoval}
                  onRetry={handleRetryImage}
                  errorText={fieldErrors.images}
                  disabled={nonLocationControlsDisabled}
                  disabledReason=""
                />

                {photoSuggestionState.status === "loading" ? (
  <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm text-sky-800">
    Looking for a location suggestion from your photo…
  </div>
  ) : null}

  {photoSuggestionState.status === "suggested" && photoSuggestionState.suggestion ? (
    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm text-amber-900">
      <div className="font-semibold text-amber-950">Suggested location from your photo</div>

      <div className="mt-1">
        {getPhotoSuggestionLabel(photoSuggestionState.suggestion)}
        {Number.isFinite(photoSuggestionState.suggestion.confidence)
          ? ` • ${formatMismatchConfidence(photoSuggestionState.suggestion.confidence)} confidence`
          : ""}
      </div>

      {Number.isFinite(photoSuggestionState.suggestion.distanceMeters) ? (
        <div className="mt-1 text-xs text-amber-800">
          Matched within {formatMismatchDistance(photoSuggestionState.suggestion.distanceMeters)}.
        </div>
      ) : null}

      <button
        type="button"
        disabled={isSubmitting}
        onClick={() => {
          applyPlaceToForm(photoSuggestionState.suggestion);
          setPhotoSuggestionState((prev) => ({
            ...prev,
            status: "applied"
          }));
        }}
        className="mt-3 inline-flex items-center justify-center rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Use this location
        </button>
      </div>
    ) : null}

    {["autofilled", "applied"].includes(photoSuggestionState.status) &&
    photoSuggestionState.suggestion ? (
      <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-800">
        <span className="font-semibold">Location suggested from your photo:</span>{" "}
        {getPhotoSuggestionLabel(photoSuggestionState.suggestion)}. Please review it before saving.
      </div>
    ) : null}

    {hasUploadedImages &&
    !["loading", "suggested", "autofilled", "applied"].includes(photoSuggestionState.status) ? (
      <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800">
        Choose the location that matches your photo. Verification runs when you save the post.
      </div>
    ) : null}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="text-sm font-semibold text-slate-900">Post title</label>
                  <span className="text-xs text-slate-400">{form.title.length}/100</span>
                </div>

                <input
                  type="text"
                  disabled={nonLocationControlsDisabled}
                  value={form.title}
                  onChange={(e) => {
                    const value = e.target.value.slice(0, 100);
                    setForm((prev) => ({ ...prev, title: value }));
                    setFieldErrors((prev) => ({
                      ...prev,
                      title: "",
                      locationName: prev.locationName === TEXT_LOCATION_FIELD_ERROR ? "" : prev.locationName
                    }));
                  }}
                  placeholder="Ancient Wonders of Rome"
                  className={[
                    "w-full rounded-2xl border bg-slate-50 px-4 py-3 text-base text-slate-900 sm:text-sm outline-none transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400",
                    titleMessage.tone === "error"
                      ? "border-rose-300 ring-2 ring-rose-100"
                      : "border-slate-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  ].join(" ")}
                />

                <p className={`mt-2 text-sm ${messageToneClass(titleMessage.tone)}`}>
                  {titleMessage.text}
                </p>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="text-sm font-semibold text-slate-900">Your memory</label>
                  <span className="text-xs text-slate-400">{form.content.length}/2000</span>
                </div>

                <textarea
                  rows={8}
                  disabled={nonLocationControlsDisabled}
                  value={form.content}
                  onChange={(e) => {
                    const value = e.target.value.slice(0, 2000);
                    setForm((prev) => ({ ...prev, content: value }));
                    setFieldErrors((prev) => ({
                      ...prev,
                      content: "",
                      locationName: prev.locationName === TEXT_LOCATION_FIELD_ERROR ? "" : prev.locationName
                    }));
                  }}
                  placeholder="Write your memory here..."
                  className={[
                    "w-full resize-none rounded-2xl border bg-slate-50 px-4 py-3 text-base leading-6 text-slate-900 sm:text-sm outline-none transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400",
                    contentMessage.tone === "error"
                      ? "border-rose-300 ring-2 ring-rose-100"
                      : "border-slate-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  ].join(" ")}
                />

                <p className={`mt-2 text-sm ${messageToneClass(contentMessage.tone)}`}>
                  {contentMessage.text}
                </p>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="text-sm font-semibold text-slate-900">Location</label>

                  <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={handleUseGps}
                      disabled={isUsingGps || isSubmitting}
                      className="text-emerald-600 transition hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isUsingGps ? "Using GPS..." : "Use GPS"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const mapNode = document.getElementById("editor-map-preview");
                        mapNode?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                      disabled={isSubmitting}
                      className="text-emerald-600 transition hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {hasResolvedLocation ? "Change on map" : "Pick on map"}
                    </button>
                  </div>
                </div>

                <LocationAutocomplete
                  value={locationQuery}
                  disabled={isSubmitting}
                  searchSuppression={locationSearchSuppression}
                  onValueChange={(nextValue) => {
                    if (nextValue.trim()) {
                      manualLocationSelectedRef.current = true;
                    }

                    setLocationQuery(nextValue);
                    clearResolvedLocation();
                    markPhotoSuggestionAsNotApplied();

                    if (!nextValue.trim()) {
                      setReverseStatus("");
                    }
                  }}
                  onSelectPlace={(place) => {
                    manualLocationSelectedRef.current = true;
                    markPhotoSuggestionAsNotApplied();
                    applyPlaceToForm(place);
                    setReverseStatus("");
                  }}
                />

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                  <span>
                    Lat: {isFiniteNumber(form.latitude) ? form.latitude.toFixed(4) : "—"}
                  </span>
                  <span>
                    Lng: {isFiniteNumber(form.longitude) ? form.longitude.toFixed(4) : "—"}
                  </span>
                  {form.city || form.country ? (
                    <span>{[form.city, form.country].filter(Boolean).join(", ")}</span>
                  ) : null}
                </div>

                {reverseStatus ? (
                  <p className="mt-2 text-sm text-slate-500">{reverseStatus}</p>
                ) : null}

                {fieldErrors.locationName ? (
                  <p className="mt-2 text-sm text-rose-600">{fieldErrors.locationName}</p>
                ) : null}
              </div>

              <div
                className={[
                  "rounded-2xl border px-4 py-4",
                  hasResolvedLocation
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-slate-200 bg-slate-50"
                ].join(" ")}
              >
                {!hasResolvedLocation ? (
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-slate-500">📍</div>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">
                        Choose the matching location before saving
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Search for a place, use GPS, or tap the map. If a photo is uploaded, the app will compare it with the selected location when you save.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-emerald-800">
                        ✓ Location: <span className="break-words">{form.locationName}</span>
                      </div>
                      <div className="mt-1 text-xs text-emerald-700">
                        {form.latitude.toFixed(3)}, {form.longitude.toFixed(3)}
                        {form.city || form.country
                          ? ` • ${[form.city, form.country].filter(Boolean).join(", ")}`
                          : ""}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const mapNode = document.getElementById("editor-map-preview");
                        mapNode?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                      className="shrink-0 text-xs font-semibold text-emerald-700 transition hover:text-emerald-800"
                    >
                      Change location
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-900">Privacy</label>

                <div className="relative">
                  <select
                    disabled={nonLocationControlsDisabled}
                    value={form.privacy}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, privacy: e.target.value }));
                    }}
                    className="w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-11 text-base font-medium text-slate-900 sm:text-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="private">🔒 Private (only me)</option>
                    <option value="public">🌍 Public (all users)</option>
                  </select>

                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                    ⌄
                  </span>
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  Private posts are visible only to you. Public posts can be seen by other authenticated users.
                </p>
              </div>

              <p className="text-sm text-slate-500">
                Sentiment is calculated automatically.
              </p>

              <div className="hidden gap-3 pt-2 md:flex md:flex-row md:items-center md:justify-between">
                <button
                  type="button"
                  onClick={() => {
                    if (!isDirty) {
                      if (isEdit) navigate(`/posts/${id}`);
                      else {
                        clearSelectedPlace();
                        navigate("/map");
                      }
                      return;
                    }

                    setDialogState({
                      type: "discard",
                      imageLocalId: null,
                      busy: false,
                      mismatchData: null
                    });
                  }}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isSubmitting
                    ? isEdit
                      ? "Saving..."
                      : "Creating..."
                    : isEdit
                      ? "Save Changes"
                      : "Create Post"}
                </button>
              </div>

              <div className="md:hidden">
                <div
                  className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-12px_30px_rgba(15,23,42,0.12)] backdrop-blur"
                  style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
                >
                  <div className="mx-auto flex max-w-[1600px] gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (!isDirty) {
                          if (isEdit) navigate(`/posts/${id}`);
                          else {
                            clearSelectedPlace();
                            navigate("/map");
                          }
                          return;
                        }

                        setDialogState({
                          type: "discard",
                          imageLocalId: null,
                          busy: false,
                          mismatchData: null
                        });
                      }}
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {isSubmitting
                        ? isEdit
                          ? "Saving..."
                          : "Creating..."
                        : isEdit
                          ? "Save Changes"
                          : "Create Post"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            id="editor-map-preview"
            className="overflow-hidden rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-[104px]"
          >
            <div className="px-2 pb-3 pt-1">
              <h2 className="text-xl font-semibold text-slate-900">Map Preview</h2>
              <p className="mt-1 text-sm text-slate-500">Tap the map or drag the pin to adjust location</p>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-slate-200">
              <div className="h-[360px] sm:h-[420px] md:h-[520px] lg:h-[680px]">
                <MapContainer
                  center={mapCenter}
                  zoom={mapZoom}
                  scrollWheelZoom={!L.Browser.mobile}
                  dragging={!L.Browser.mobile}
                  className="h-full w-full"
                >
                  <MapSyncView center={mapCenter} zoom={mapZoom} />
                  <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
                  <MapInteraction
                    onPick={(latlng) => {
                      resolveLocationFromCoords(latlng.lat, latlng.lng, {
                        fallbackLabel: "Dropped pin"
                      });
                    }}
                  />

                  {isValidCoordinatePair(form.latitude, form.longitude) && (
                    <Marker
                      icon={sentimentMarkerIcon}
                      position={[form.latitude, form.longitude]}
                      draggable
                      eventHandlers={{
                        dragend: (event) => {
                          const next = event.target.getLatLng();
                          resolveLocationFromCoords(next.lat, next.lng, {
                            fallbackLabel: "Dropped pin"
                          });
                        }
                      }}
                    />
                  )}
                </MapContainer>
              </div>
            </div>
          </section>
        </form>
      </div>

      <ActionDialog
        open={dialogState.type === "discard"}
        tone="neutral"
        busy={dialogState.busy}
        title="Discard changes?"
        message="Your changes will not be saved. Any newly uploaded draft images will be cleaned up best-effort."
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        onClose={() => setDialogState(EMPTY_DIALOG_STATE)}
        onConfirm={handleDiscard}
      />

      <ActionDialog
        open={dialogState.type === "remove-image"}
        tone="danger"
        busy={dialogState.busy}
        title="Remove this image?"
        message={
          isEdit
            ? "The image will disappear from the preview immediately. Existing images are deleted from the post only after you save changes."
            : "The image will disappear from the preview immediately. Newly uploaded draft images are cleaned up best-effort."
        }
        confirmLabel="Remove"
        cancelLabel="Keep"
        onClose={() => setDialogState(EMPTY_DIALOG_STATE)}
        onConfirm={handleConfirmRemoveImage}
      />

      <ActionDialog
        open={dialogState.type === "photo-location-mismatch"}
        tone="danger"
        busy={false}
        title="Photo and location don't seem to match"
        message={
          <div>
            <p>{dialogState.mismatchData?.message || DEFAULT_PHOTO_MISMATCH_MESSAGE}</p>

            {(dialogState.mismatchData?.detectedLandmark ||
              Number.isFinite(dialogState.mismatchData?.confidence) ||
              Number.isFinite(dialogState.mismatchData?.distanceMeters)) && (
              <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50/70 p-4">
                <div className="text-sm font-semibold text-slate-900">
                  What the verification found
                </div>

                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  {dialogState.mismatchData?.detectedLandmark ? (
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-slate-500">Detected landmark</span>
                      <span className="text-right font-medium text-slate-900">
                        {dialogState.mismatchData.detectedLandmark}
                      </span>
                    </div>
                  ) : null}

                  {Number.isFinite(dialogState.mismatchData?.confidence) ? (
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-slate-500">Confidence</span>
                      <span className="text-right font-medium text-slate-900">
                        {formatMismatchConfidence(dialogState.mismatchData.confidence)}
                      </span>
                    </div>
                  ) : null}

                  {Number.isFinite(dialogState.mismatchData?.distanceMeters) ? (
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-slate-500">Distance from selected place</span>
                      <span className="text-right font-medium text-slate-900">
                        {formatMismatchDistance(dialogState.mismatchData.distanceMeters)}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            <p className="mt-4 text-slate-600">
              Your uploaded images are still here. You can correct the location or replace the
              photo and try again.
            </p>
          </div>
        }
        confirmLabel="OK, I'll fix it"
        showCancelButton={false}
        icon="📷"
        onClose={() => setDialogState(EMPTY_DIALOG_STATE)}
        onConfirm={() => setDialogState(EMPTY_DIALOG_STATE)}
      />
      <ActionDialog
        open={dialogState.type === "text-location-mismatch"}
        tone="danger"
        busy={false}
        title="Text and location don't seem to match"
        message={
          <div>
            <p>{dialogState.mismatchData?.message || DEFAULT_TEXT_MISMATCH_MESSAGE}</p>

            {(dialogState.mismatchData?.mentionedLocation ||
              dialogState.mismatchData?.selectedLocation ||
              Number.isFinite(dialogState.mismatchData?.confidence) ||
              Number.isFinite(dialogState.mismatchData?.distanceMeters)) && (
              <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50/70 p-4">
                <div className="text-sm font-semibold text-slate-900">
                  What the text check found
                </div>

                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  {dialogState.mismatchData?.mentionedLocation ? (
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-slate-500">Text appears to describe</span>
                      <span className="text-right font-medium text-slate-900">
                        {dialogState.mismatchData.mentionedLocation}
                      </span>
                    </div>
                  ) : null}

                  {dialogState.mismatchData?.selectedLocation ? (
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-slate-500">Selected location</span>
                      <span className="text-right font-medium text-slate-900">
                        {dialogState.mismatchData.selectedLocation}
                      </span>
                    </div>
                  ) : null}

                  {Number.isFinite(dialogState.mismatchData?.confidence) ? (
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-slate-500">Extraction confidence</span>
                      <span className="text-right font-medium text-slate-900">
                        {formatMismatchConfidence(dialogState.mismatchData.confidence)}
                      </span>
                    </div>
                  ) : null}

                  {Number.isFinite(dialogState.mismatchData?.distanceMeters) ? (
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-slate-500">Distance between locations</span>
                      <span className="text-right font-medium text-slate-900">
                        {formatMismatchDistance(dialogState.mismatchData.distanceMeters)}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            <p className="mt-4 text-slate-600">
              Please correct the selected location or update the title/description, then try saving again.
            </p>
          </div>
        }
        confirmLabel="OK, I'll fix it"
        showCancelButton={false}
        icon="📝"
        onClose={() => setDialogState(EMPTY_DIALOG_STATE)}
        onConfirm={() => setDialogState(EMPTY_DIALOG_STATE)}
      />
    </>
  );
}