// frontend/src/pages/MapPage.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Tooltip,
  useMap,
  useMapEvents
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import L from "leaflet";
import { api } from "../api/axios.js";
import { getPostById } from "../api/posts.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { useLocationContext } from "../hooks/useLocationContext.js";
import { formatSentimentScore, getSentimentUi } from "../utils/sentimentUi.js";
import Lightbox from "../components/ui/Lightbox.jsx";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import {
  buildCloudinarySrcSet,
  makeCloudinaryOptimizer
} from "../utils/cloudinaryImage.js";
import {
  getPlaceCategoryUi,
  normalizePlaceCategory
} from "../utils/placeCategoryUi.js";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';


const MAP_FETCH_DEBOUNCE_MS = 500;
const WORLD_LNG_EPSILON = 1e-6;
const INITIAL_CENTER = [45.9432, 24.9668];
const INITIAL_ZOOM = 6;
const PANEL_THUMB_LIMIT = 3;
const AI_COOLDOWN_MS = 60_000;
const MOBILE_SHEET_CLOSE_THRESHOLD_PX = 90;
const MOBILE_SHEET_MAX_DRAG_PX = 220;

const markerIconCache = new Map();

const DEFAULT_AI_STATE_OBJECT = Object.freeze({
  status: "idle",
  content: "",
  error: "",
  source: "",
  cooldownUntil: 0
});

function getDefaultAiState() {
  return { ...DEFAULT_AI_STATE_OBJECT };
}

function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      onPick?.(e.latlng);
    }
  });
  return null;
}

function FlyToCenter({ center, zoom }) {
  const map = useMap();
  const prevKeyRef = useRef("");

  useEffect(() => {
    if (!center || !Number.isFinite(center[0]) || !Number.isFinite(center[1])) return;

    const key = `${center[0].toFixed(6)},${center[1].toFixed(6)},${zoom}`;
    if (prevKeyRef.current === key) return;
    prevKeyRef.current = key;

    map.flyTo(center, zoom, { duration: 1.5 });
  }, [map, center, zoom]);

  return null;
}

function clampLat(value) {
  return Math.max(-90, Math.min(90, Number(value)));
}

function normalizeLng(value) {
  let lng = Number(value);
  while (lng < -180) lng += 360;
  while (lng > 180) lng -= 360;
  return lng;
}

function getFiniteLatLng(latValue, lngValue) {
  const lat = Number(latValue);
  const lng = Number(lngValue);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  return { lat, lng };
}

function serializeBounds(bounds) {
  return [
    bounds.northLat.toFixed(3),
    bounds.southLat.toFixed(3),
    bounds.eastLng.toFixed(3),
    bounds.westLng.toFixed(3)
  ].join("|");
}

function buildViewportPayload(leafletBounds) {
  if (!leafletBounds) return null;

  const rawNorth = Number(leafletBounds.getNorth());
  const rawSouth = Number(leafletBounds.getSouth());
  const rawEast = Number(leafletBounds.getEast());
  const rawWest = Number(leafletBounds.getWest());

  if (![rawNorth, rawSouth, rawEast, rawWest].every(Number.isFinite)) {
    return null;
  }

  const northLat = clampLat(rawNorth);
  const southLat = clampLat(rawSouth);

  const rawSpan = rawEast - rawWest;

  let eastLng;
  let westLng;

  if (rawSpan >= 360 - WORLD_LNG_EPSILON) {
    westLng = -180;
    eastLng = 180;
  } else {
    westLng = normalizeLng(rawWest);
    eastLng = normalizeLng(rawEast);

    if (eastLng < westLng) {
      westLng = -180;
      eastLng = 180;
    }
  }

  const payload = { northLat, southLat, eastLng, westLng };

  return {
    ...payload,
    cacheKey: serializeBounds(payload)
  };
}

function MapViewportReporter({ onViewportChange }) {
  const map = useMap();

  const emit = useCallback(() => {
    const next = buildViewportPayload(map.getBounds());
    onViewportChange?.(next);
  }, [map, onViewportChange]);

  useEffect(() => {
    map.whenReady(() => {
      emit();
    });
  }, [map, emit]);

  useMapEvents({
    moveend: emit
  });

  return null;
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium"
  }).format(date);
}

const optimizeCloudinaryUrl = makeCloudinaryOptimizer(
  {
    thumb: "c_fill,g_auto,w_640,h_420,f_auto,q_auto",
    full: "c_limit,w_2000,f_auto,q_auto",
    preview: "c_limit,w_1440,f_auto,q_auto",
    panel: "c_fill,g_auto,w_1200,h_760,f_auto,q_auto"
  },
  "panel"
);

function getPanelThumbSizes(imageCount = 1) {
  if (imageCount <= 1) {
    return "(max-width: 767px) 100vw, 340px";
  }

  return "(max-width: 767px) 30vw, 96px";
}


function buildAiPayload(post, details) {
  const locationName = String(details?.locationName || post?.locationName || "").trim();
  const latitude = Number(post?.latitude ?? details?.latitude);
  const longitude = Number(post?.longitude ?? details?.longitude);

  const city =
    typeof details?.city === "string" && details.city.trim() ? details.city.trim() : undefined;

  const country =
    typeof details?.country === "string" && details.country.trim()
      ? details.country.trim()
      : undefined;

  return {
    locationName,
    latitude,
    longitude,
    ...(city ? { city } : {}),
    ...(country ? { country } : {})
  };
}

function getAiLocationLabel(post, details) {
  return details?.locationName || post?.locationName || "this location";
}

function getPostMarkerIcon(sentiment, placeCategory, isActive = false) {
  const normalizedCategory = normalizePlaceCategory(placeCategory);
  const key = `${sentiment}:${normalizedCategory}:${isActive ? "active" : "idle"}`;
  const cached = markerIconCache.get(key);
  if (cached) return cached;

  const ui = getSentimentUi(sentiment);
  const categoryUi = getPlaceCategoryUi(normalizedCategory);
  const circleSize = isActive ? 28 : 24;
  const pointerHeight = isActive ? 12 : 10;
  const pointerHalf = isActive ? 7 : 6;
  const shadow = isActive
    ? "0 0 0 4px rgba(255,255,255,0.88), 0 12px 20px rgba(15,23,42,0.32)"
    : "0 8px 16px rgba(15,23,42,0.22)";

  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-2px);">
      <div
        style="
          width:${circleSize}px;
          height:${circleSize}px;
          border-radius:9999px;
          background:${ui.color};
          border:3px solid #ffffff;
          box-shadow:${shadow};
          transition:transform 200ms ease;
          display:flex;
          align-items:center;
          justify-content:center;
          color:#ffffff;
          font-size:${isActive ? "12px" : "11px"};
          font-weight:800;
          font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          letter-spacing:0.02em;
        "
      >${categoryUi.shortLabel}</div>
      <div
        style="
          width:0;
          height:0;
          border-left:${pointerHalf}px solid transparent;
          border-right:${pointerHalf}px solid transparent;
          border-top:${pointerHeight}px solid ${ui.color};
          margin-top:-1px;
          filter:drop-shadow(0 4px 6px rgba(15,23,42,0.18));
        "
      ></div>
    </div>
  `;

  const icon = L.divIcon({
    className: "",
    html,
    iconSize: [circleSize + 8, circleSize + pointerHeight + 8],
    iconAnchor: [(circleSize + 8) / 2, circleSize + pointerHeight + 4]
  });

  markerIconCache.set(key, icon);
  return icon;
}

function resolveClusterUiFromMarkers(markers) {
  let positive = 0;
  let negative = 0;
  let neutral = 0;

  for (const marker of markers) {
    const sentiment = marker?.options?.postSentiment;
    if (sentiment === "positive") positive += 1;
    else if (sentiment === "negative") negative += 1;
    else neutral += 1;
  }

  if (positive > negative && positive > neutral) {
    return getSentimentUi("positive");
  }

  if (negative > positive && negative > neutral) {
    return getSentimentUi("negative");
  }

  return getSentimentUi("neutral");
}

function createClusterIcon(cluster) {
  const count = cluster.getChildCount();
  const children = cluster.getAllChildMarkers();
  const ui = resolveClusterUiFromMarkers(children);

  const size = count < 10 ? 40 : count < 50 ? 46 : 52;

  const html = `
    <div
      style="
        width:${size}px;
        height:${size}px;
        border-radius:9999px;
        background:${ui.color};
        border:4px solid rgba(255,255,255,0.92);
        box-shadow:0 10px 22px rgba(15,23,42,0.22);
        display:flex;
        align-items:center;
        justify-content:center;
        color:#ffffff;
        font-weight:700;
        font-size:${count < 100 ? "14px" : "13px"};
      "
    >
      ${count}
    </div>
  `;

  return L.divIcon({
    html,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}


function ImageStrip({ title, previewImage, images, lightboxOpenAt, detailsLoading }) {
  const normalizedImages = Array.isArray(images) ? images.filter((img) => img?.secureUrl) : [];

  if (normalizedImages.length > 0) {
    const visible = normalizedImages.slice(0, PANEL_THUMB_LIMIT);
    const remaining = Math.max(0, normalizedImages.length - PANEL_THUMB_LIMIT);

    return (
      <div className="mt-4">
        <div className="grid grid-cols-3 gap-3">
          {visible.map((image, index) => {
            const isLastVisible = index === visible.length - 1;
            const showMoreBadge = remaining > 0 && isLastVisible;

            return (
              <button
                key={image.id ?? image.publicId ?? index}
                type="button"
                onClick={() => lightboxOpenAt(index)}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-left"
              >
                <img
                  src={optimizeCloudinaryUrl(image.secureUrl, "thumb")}
                  srcSet={buildCloudinarySrcSet(image.secureUrl, {
                    widths: [240, 320, 480, 640],
                    crop: "fill",
                    gravity: "auto",
                    height: 420
                  })}
                  sizes={getPanelThumbSizes(normalizedImages.length)}
                  alt={`${title} image ${index + 1}`}
                  className="h-28 w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                  loading="lazy"
                  decoding="async"
                />

                {showMoreBadge && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/55">
                    <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-900">
                      +{remaining} more
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (detailsLoading) {
    return (
      <div className="mt-4">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={idx}
              className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-slate-100"
            />
          ))}
        </div>
      </div>
    );
  }

  if (previewImage) {
    return (
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        <img
          src={optimizeCloudinaryUrl(previewImage, "preview")}
          srcSet={buildCloudinarySrcSet(previewImage, {
            widths: [480, 768, 1024, 1440],
            crop: "limit"
          })}
          sizes="(max-width: 767px) 100vw, 340px"
          alt={title}
          className="h-52 w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
      No preview image for this post.
    </div>
  );
}

function MapPostPanel({
  post,
  details,
  detailsLoading,
  detailsError,
  aiState,
  aiRemainingSeconds,
  isOpen,
  onClose,
  onOpenLightbox,
  onRequestLearnMore
}) {
  const hasPost = Boolean(post);
  const sentimentScore = details?.sentimentScore ?? post?.sentimentScore ?? null;
  const sentimentUi = hasPost
    ? getSentimentUi(post.sentiment, sentimentScore, "map")
    : getSentimentUi("neutral", null, "map");
  const placeCategoryUi = getPlaceCategoryUi(details?.placeCategory || post?.placeCategory);
  const detailImages = Array.isArray(details?.images) ? details.images : [];

  const aiStatus = aiState?.status || "idle";
  const aiContent = aiState?.content || "";
  const aiError = aiState?.error || "";
  const aiSource = aiState?.source || "";

  const hasAiContent = Boolean(aiContent);
  const isAiLoading = aiStatus === "loading";
  const aiCardVisible = isAiLoading || Boolean(aiError) || hasAiContent;

  const aiButtonLabel =
    aiRemainingSeconds > 0
      ? `Try again in ${aiRemainingSeconds}s`
      : isAiLoading
        ? "Loading..."
        : aiError
          ? "Retry Learn More"
          : hasAiContent
            ? "Refresh Learn More"
            : "Learn More";

  const handleAiButtonClick = () => {
    if (aiRemainingSeconds > 0 || isAiLoading) return;
    onRequestLearnMore?.();
  };

  const touchStartYRef = useRef(null);
  const [mobileDragOffsetY, setMobileDragOffsetY] = useState(0);
  const [isMobileDragging, setIsMobileDragging] = useState(false);

  const resetMobileDrag = useCallback(() => {
    touchStartYRef.current = null;
    setMobileDragOffsetY(0);
    setIsMobileDragging(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      resetMobileDrag();
    }
  }, [isOpen, resetMobileDrag]);

  const handleMobileHandleTouchStart = (e) => {
    if (!isOpen) return;

    const touch = e.touches?.[0];
    if (!touch) return;

    touchStartYRef.current = touch.clientY;
    setIsMobileDragging(true);
  };

  const handleMobileHandleTouchMove = (e) => {
    if (!isOpen || touchStartYRef.current == null) return;

    const touch = e.touches?.[0];
    if (!touch) return;

    const rawDelta = touch.clientY - touchStartYRef.current;
    const nextOffset = Math.max(0, Math.min(MOBILE_SHEET_MAX_DRAG_PX, rawDelta));

    if (nextOffset > 0) {
      e.preventDefault();
    }

    setMobileDragOffsetY(nextOffset);
  };

  const handleMobileHandleTouchEnd = () => {
    if (!isOpen) return;

    const shouldClose = mobileDragOffsetY >= MOBILE_SHEET_CLOSE_THRESHOLD_PX;
    resetMobileDrag();

    if (shouldClose) {
      onClose?.();
    }
  };

  const panelBody = hasPost ? (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <div className="line-clamp-2 text-base font-semibold text-slate-900">{post.title}</div>
          <div className="mt-2 truncate text-sm text-slate-500">📍 {post.locationName}</div>
          <div className="mt-1 truncate text-sm text-slate-500">By @{post.username}</div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close post preview"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${sentimentUi.badge}`}
          >
            <span aria-hidden="true">{sentimentUi.emoji}</span>
            <span>{sentimentUi.label}</span>
          </span>

          {sentimentScore != null ? (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              Score: {formatSentimentScore(sentimentScore)}
            </span>
          ) : null}

          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {post.privacy === "public" ? "🌍 Public" : "🔒 Private"}
          </span>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${placeCategoryUi.badge}`}
          >
            <span aria-hidden="true">{placeCategoryUi.icon}</span>
            <span>{placeCategoryUi.label}</span>
          </span>

          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {formatDate(post.createdAt)}
          </span>
        </div>

        <ImageStrip
          title={post.title}
          previewImage={post.previewImage}
          images={detailImages}
          detailsLoading={detailsLoading}
          lightboxOpenAt={onOpenLightbox}
        />

        {detailsError ? (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {detailsError}
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</div>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">
            {post.contentPreview || "No preview available."}
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <Link
            to={`/posts/${post.id}`}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            View Full Post
          </Link>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-emerald-900">
                  ✨ Learn more about this location
                </div>
                <div className="mt-1 text-xs text-emerald-800/80">
                  Get quick historical and cultural context for {getAiLocationLabel(post, details)}.
                </div>
              </div>

              {!isAiLoading && !aiError && hasAiContent && aiSource ? (
                <span className="shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                  {aiSource === "cache" ? "Cached" : "Fresh"}
                </span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={handleAiButtonClick}
              disabled={aiRemainingSeconds > 0 || isAiLoading}
              aria-busy={isAiLoading}
              className={[
                "mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition",
                aiRemainingSeconds > 0 || isAiLoading
                  ? "cursor-not-allowed bg-emerald-100 text-emerald-500"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              ].join(" ")}
            >
              {isAiLoading ? (
                <span
                  aria-hidden="true"
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                />
              ) : (
                <span aria-hidden="true">✨</span>
              )}
              <span>{aiButtonLabel}</span>
            </button>

            {aiCardVisible ? (
              <div className="mt-3">
                {isAiLoading ? (
                  <div className="rounded-2xl border border-emerald-200 bg-white/80 px-4 py-4">
                    <div className="text-sm font-semibold text-slate-900">
                      About {getAiLocationLabel(post, details)}
                    </div>
                    <div className="mt-2 space-y-2">
                      <div className="h-4 animate-pulse rounded bg-emerald-100" />
                      <div className="h-4 animate-pulse rounded bg-emerald-100" />
                      <div className="h-4 w-4/5 animate-pulse rounded bg-emerald-100" />
                    </div>
                  </div>
                ) : aiError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                    <div className="font-semibold text-rose-800">
                      Couldn&apos;t load extra information
                    </div>
                    <div className="mt-1">{aiError}</div>
                  </div>
                ) : hasAiContent ? (
                  <div className="rounded-2xl border border-emerald-200 bg-white/80 px-4 py-4">
                    <div className="text-sm font-semibold text-slate-900">
                      About {getAiLocationLabel(post, details)}
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">
                      {aiContent}
                    </p>
                    <div className="mt-3 text-xs italic text-slate-500">
                      Powered by Google Gemini
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  const mobileSheetStyle = {
    transform: isOpen ? `translateY(${mobileDragOffsetY}px)` : "translateY(110%)",
    opacity: isOpen ? 1 : 0,
    transition: isMobileDragging ? "none" : "transform 300ms ease-out, opacity 300ms ease-out"
  };

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-[1201] hidden md:block">
        <div
          className={[
            "pointer-events-auto absolute bottom-6 left-6 top-6 w-[340px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl",
            "transition-all duration-300 ease-out",
            isOpen ? "translate-x-0 opacity-100" : "-translate-x-[110%] opacity-0"
          ].join(" ")}
          aria-hidden={!isOpen}
        >
          {panelBody}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 z-[1201] md:hidden">
        {isOpen ? (
          <button
            type="button"
            aria-label="Close post preview"
            onClick={onClose}
            className="pointer-events-auto absolute inset-0 bg-slate-950/20"
          />
        ) : null}

        <div
          className="pointer-events-auto absolute inset-x-3 bottom-3 h-[68%] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
          aria-hidden={!isOpen}
          style={mobileSheetStyle}
        >
          {isOpen ? (
            <>
              <div
                className="flex cursor-grab justify-center pt-2 active:cursor-grabbing"
                onTouchStart={handleMobileHandleTouchStart}
                onTouchMove={handleMobileHandleTouchMove}
                onTouchEnd={handleMobileHandleTouchEnd}
                onTouchCancel={handleMobileHandleTouchEnd}
              >
                <div className="h-1.5 w-10 rounded-full bg-slate-300" />
              </div>
              <div className="h-[calc(100%-12px)]">{panelBody}</div>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

export default function MapPage() {
  const { selectedPlace, selectionSource, setSelectedPlace } = useLocationContext();

  const [marker, setMarker] = useState(null);
  const [label, setLabel] = useState("");
  const [reverseStatus, setReverseStatus] = useState("");

  const [mapPosts, setMapPosts] = useState([]);
  const [countInBounds, setCountInBounds] = useState(0);
  const [selectedPost, setSelectedPost] = useState(null);
  const [selectedPostDetails, setSelectedPostDetails] = useState(null);
  const [selectedPostDetailsLoading, setSelectedPostDetailsLoading] = useState(false);
  const [selectedPostDetailsError, setSelectedPostDetailsError] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  const [viewportBounds, setViewportBounds] = useState(null);
  const debouncedViewportBounds = useDebouncedValue(viewportBounds, MAP_FETCH_DEBOUNCE_MS);
  const [isPostsLoading, setIsPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState("");

  const [aiByPostId, setAiByPostId] = useState({});
  const [tickNowMs, setTickNowMs] = useState(Date.now());

  const reverseAbortRef = useRef(null);
  const reverseReqIdRef = useRef(0);

  const postsAbortRef = useRef(null);
  const postsReqIdRef = useRef(0);
  const postsCacheRef = useRef(new Map());
  const lastViewportKeyRef = useRef("");

  const detailsAbortRef = useRef(null);
  const detailsReqIdRef = useRef(0);
  const detailsCacheRef = useRef(new Map());

  const aiRequestRef = useRef(null);
  const aiReqIdRef = useRef(0);

  const lastReverseToastAtRef = useRef(0);
  const lastMapToastAtRef = useRef(0);

  function patchAiState(postId, patch) {
    if (!postId) return;

    setAiByPostId((prev) => ({
      ...prev,
      [postId]: {
        ...(prev[postId] || getDefaultAiState()),
        ...patch
      }
    }));
  }

  function resetLoadingAiState(postId) {
    if (!postId) return;

    setAiByPostId((prev) => {
      const current = prev[postId];
      if (!current || current.status !== "loading") {
        return prev;
      }

      return {
        ...prev,
        [postId]: {
          ...current,
          status: current.content ? "ready" : "idle",
          error: ""
        }
      };
    });
  }

  function toastReverseOnce(msg) {
    const now = Date.now();
    if (now - lastReverseToastAtRef.current < 1500) return;
    lastReverseToastAtRef.current = now;
    toast.error(msg);
  }

  function toastMapOnce(msg) {
    const now = Date.now();
    if (now - lastMapToastAtRef.current < 1500) return;
    lastMapToastAtRef.current = now;
    toast.error(msg);
  }

  useEffect(() => {
    return () => {
      if (reverseAbortRef.current) reverseAbortRef.current.abort();
      if (postsAbortRef.current) postsAbortRef.current.abort();
      if (detailsAbortRef.current) detailsAbortRef.current.abort();

      if (aiRequestRef.current?.controller) {
        aiRequestRef.current.controller.abort();
        resetLoadingAiState(aiRequestRef.current.postId);
        aiRequestRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (aiRequestRef.current?.controller) {
        aiRequestRef.current.controller.abort();
        resetLoadingAiState(aiRequestRef.current.postId);
        aiRequestRef.current = null;
      }
    };
  }, [selectedPost?.id]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== "Escape") return;

      if (lightboxIndex >= 0) {
        return;
      }

      setSelectedPost(null);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [lightboxIndex]);

  const center = useMemo(() => {
  const selectedCoords = getFiniteLatLng(selectedPlace?.lat, selectedPlace?.lng);
  if (selectedCoords) {
    return [selectedCoords.lat, selectedCoords.lng];
  }

  const markerCoords = getFiniteLatLng(marker?.lat, marker?.lng);
  if (markerCoords) {
    return [markerCoords.lat, markerCoords.lng];
  }

  return INITIAL_CENTER;
  }, [selectedPlace, marker]);

  const zoom = useMemo(() => {
    if (selectedPlace?.lat != null && selectedPlace?.lng != null) {
      if (selectionSource === "click") return 13;
      return 14;
    }

    if (marker?.lat != null && marker?.lng != null) return 13;
    return INITIAL_ZOOM;
  }, [selectedPlace, marker, selectionSource]);

  useEffect(() => {
    if (selectedPlace?.lat == null || selectedPlace?.lng == null) return;

    const coords = getFiniteLatLng(selectedPlace.lat, selectedPlace.lng);
    if (!coords) return;

    const { lat, lng } = coords;

    if (selectionSource === "search") {
      setSelectedPost(null);
      setSelectedPostDetails(null);
      setSelectedPostDetailsError("");
      setSelectedPostDetailsLoading(false);
      setLightboxIndex(-1);

      if (detailsAbortRef.current) {
        detailsAbortRef.current.abort();
        detailsAbortRef.current = null;
      }

      if (aiRequestRef.current?.controller) {
        aiRequestRef.current.controller.abort();
        resetLoadingAiState(aiRequestRef.current.postId);
        aiRequestRef.current = null;
      }
    }

    setMarker({ lat, lng });
    setLabel(selectedPlace.locationName || selectedPlace.displayName || "");
    setReverseStatus("");

    if (selectionSource === "search") {
      if (reverseAbortRef.current) reverseAbortRef.current.abort();
      reverseAbortRef.current = null;
      reverseReqIdRef.current += 1;
    }
  }, [selectedPlace, selectionSource]);

  useEffect(() => {
    if (!selectedPost) {
      setSelectedPostDetails(null);
      setSelectedPostDetailsError("");
      setSelectedPostDetailsLoading(false);
      setLightboxIndex(-1);

      if (detailsAbortRef.current) detailsAbortRef.current.abort();
      detailsAbortRef.current = null;
      return;
    }

    const fresh = mapPosts.find((post) => post.id === selectedPost.id);
    if (!fresh) {
      setSelectedPost(null);
      return;
    }

    if (fresh !== selectedPost) {
      setSelectedPost(fresh);
    }
  }, [mapPosts, selectedPost]);

  useEffect(() => {
    if (!selectedPost?.id) return;

    setLightboxIndex(-1);

    const cached = detailsCacheRef.current.get(selectedPost.id);
    if (cached) {
      setSelectedPostDetails(cached);
      setSelectedPostDetailsError("");
      setSelectedPostDetailsLoading(false);
      return;
    }

    if (detailsAbortRef.current) detailsAbortRef.current.abort();

    const controller = new AbortController();
    detailsAbortRef.current = controller;

    const reqId = (detailsReqIdRef.current += 1);
    setSelectedPostDetails(null);
    setSelectedPostDetailsError("");
    setSelectedPostDetailsLoading(true);

    (async () => {
      try {
        const post = await getPostById(selectedPost.id, {
          signal: controller.signal,
          timeout: 15000
        });

        if (reqId !== detailsReqIdRef.current) return;

        detailsCacheRef.current.set(selectedPost.id, post);
        setSelectedPostDetails(post);
        setSelectedPostDetailsError("");
      } catch (err) {
        if (
          err?.name === "CanceledError" ||
          err?.code === "ERR_CANCELED" ||
          err?.name === "AbortError"
        ) {
          return;
        }

        if (reqId !== detailsReqIdRef.current) return;

        setSelectedPostDetailsError("Could not load all images for this post.");
      } finally {
        if (reqId === detailsReqIdRef.current) {
          setSelectedPostDetailsLoading(false);

          if (detailsAbortRef.current === controller) {
            detailsAbortRef.current = null;
          }
        }
      }
    })();
  }, [selectedPost?.id]);

  const selectedAiState = selectedPost?.id
    ? aiByPostId[selectedPost.id] || DEFAULT_AI_STATE_OBJECT
    : DEFAULT_AI_STATE_OBJECT;

  useEffect(() => {
    const cooldownUntil = selectedAiState?.cooldownUntil || 0;
    if (!cooldownUntil || cooldownUntil <= Date.now()) return undefined;

    setTickNowMs(Date.now());

    const id = window.setInterval(() => {
      const now = Date.now();
      setTickNowMs(now);

      if (cooldownUntil <= now) {
        window.clearInterval(id);
      }
    }, 1000);

    return () => window.clearInterval(id);
  }, [selectedAiState?.cooldownUntil]);

  const aiRemainingSeconds = useMemo(() => {
    const cooldownUntil = selectedAiState?.cooldownUntil || 0;
    if (!cooldownUntil) return 0;

    const remaining = Math.ceil((cooldownUntil - tickNowMs) / 1000);
    return Math.max(0, remaining);
  }, [selectedAiState?.cooldownUntil, tickNowMs]);

  const markerCoordsForRender = useMemo(() => {
    return marker ? getFiniteLatLng(marker.lat, marker.lng) : null;
  }, [marker]);

  const handleViewportChange = useCallback((nextBounds) => {
    if (!nextBounds) return;

    if (lastViewportKeyRef.current === nextBounds.cacheKey) {
      return;
    }

    lastViewportKeyRef.current = nextBounds.cacheKey;
    setViewportBounds(nextBounds);
  }, []);

  async function reverseGeocode(lat, lng, signal) {
    const res = await api.post("/geocode/reverse", { lat, lng }, { timeout: 15000, signal });
    return res?.data?.result || null;
  }

  async function fetchMapPosts(bounds, signal) {
    const res = await api.get("/map/posts", {
      params: {
        northLat: bounds.northLat,
        southLat: bounds.southLat,
        eastLng: bounds.eastLng,
        westLng: bounds.westLng
      },
      timeout: 15000,
      signal
    });

    const rawPosts = Array.isArray(res?.data?.posts) ? res.data.posts : [];
    const posts = rawPosts.filter((post) => post?.id != null && getFiniteLatLng(post.latitude, post.longitude));

    return {
      posts,
      countInBounds: Number.isFinite(Number(res?.data?.countInBounds))
        ? Number(res.data.countInBounds)
        : posts.length
    };
  }

  async function requestLearnMore(post, details) {
    if (!post?.id) return;

    const postId = post.id;
    const payload = buildAiPayload(post, details);

    const payloadCoords = getFiniteLatLng(payload.latitude, payload.longitude);

    if (!payload.locationName || !payloadCoords) {
      patchAiState(postId, {
        status: "error",
        error: "Location data is incomplete for this post.",
        content: "",
        source: "",
        cooldownUntil: 0
      });
      return;
    }

    const safePayload = {
      ...payload,
      latitude: payloadCoords.lat,
      longitude: payloadCoords.lng
    };

    if (aiRequestRef.current?.controller) {
      aiRequestRef.current.controller.abort();
      resetLoadingAiState(aiRequestRef.current.postId);
      aiRequestRef.current = null;
    }

    const controller = new AbortController();
    const reqId = (aiReqIdRef.current += 1);

    aiRequestRef.current = {
      controller,
      postId,
      reqId
    };

    patchAiState(postId, {
      status: "loading",
      error: ""
    });

    try {
      const res = await api.post("/ai/learn-more", safePayload, {
        timeout: 15000,
        signal: controller.signal
      });

      if (reqId !== aiReqIdRef.current) return;

      const content = typeof res?.data?.content === "string" ? res.data.content.trim() : "";
      const source = typeof res?.data?.source === "string" ? res.data.source : "";

      if (!content || content.length < 20) {
        patchAiState(postId, {
          status: "error",
          error: "No additional information available for this location.",
          content: "",
          source: "",
          cooldownUntil: 0
        });
        return;
      }

      patchAiState(postId, {
        status: "ready",
        content,
        error: "",
        source,
        cooldownUntil: 0
      });
    } catch (err) {
      if (
        err?.name === "CanceledError" ||
        err?.code === "ERR_CANCELED" ||
        err?.name === "AbortError"
      ) {
        return;
      }

      if (reqId !== aiReqIdRef.current) return;

      const status = err?.response?.status;
      const message = err?.response?.data?.message;

      if (status === 429) {
        patchAiState(postId, {
          status: "error",
          error: message || "Too many requests. Please try again in a moment.",
          cooldownUntil: Date.now() + AI_COOLDOWN_MS
        });
      } else if (!err?.response) {
        patchAiState(postId, {
          status: "error",
          error: "Failed to load information. Please try again.",
          content: "",
          source: "",
          cooldownUntil: 0
        });
      } else {
        patchAiState(postId, {
          status: "error",
          error: "Unable to load information at this time.",
          content: "",
          source: "",
          cooldownUntil: 0
        });
      }
    } finally {
      if (
        aiRequestRef.current?.controller === controller &&
        aiRequestRef.current?.reqId === reqId
      ) {
        aiRequestRef.current = null;
      }
    }
  }

  useEffect(() => {
    if (!debouncedViewportBounds) return;

    const cached = postsCacheRef.current.get(debouncedViewportBounds.cacheKey);
    if (cached) {
      setMapPosts(cached.posts);
      setCountInBounds(cached.countInBounds);
      setPostsError("");
      setIsPostsLoading(false);
      return;
    }

    if (postsAbortRef.current) postsAbortRef.current.abort();

    const controller = new AbortController();
    postsAbortRef.current = controller;

    const reqId = (postsReqIdRef.current += 1);
    setIsPostsLoading(true);
    setPostsError("");

    (async () => {
      try {
        const result = await fetchMapPosts(debouncedViewportBounds, controller.signal);

        if (reqId !== postsReqIdRef.current) return;

        postsCacheRef.current.set(debouncedViewportBounds.cacheKey, result);
        setMapPosts(result.posts);
        setCountInBounds(result.countInBounds);
        setPostsError("");
      } catch (err) {
        if (
          err?.name === "CanceledError" ||
          err?.code === "ERR_CANCELED" ||
          err?.name === "AbortError"
        ) {
          return;
        }

        if (reqId !== postsReqIdRef.current) return;

        const status = err?.response?.status;
        const message = err?.response?.data?.message;

        if (status === 429) {
          const m = message || "Too many map requests, please slow down.";
          setPostsError(m);
          toastMapOnce(m);
        } else if (status === 401) {
          setPostsError("Authentication required.");
        } else if (status === 500) {
          const m = "Unable to load posts, try again.";
          setPostsError(m);
          toastMapOnce(m);
        } else {
          const m = "Failed to load posts.";
          setPostsError(m);
          toastMapOnce(m);
        }
      } finally {
        if (reqId === postsReqIdRef.current) {
          setIsPostsLoading(false);

          if (postsAbortRef.current === controller) {
            postsAbortRef.current = null;
          }
        }
      }
    })();
  }, [debouncedViewportBounds]);

  async function onMapPick(latlng) {
    const coords = getFiniteLatLng(latlng?.lat, latlng?.lng);

    if (!coords) {
      toastReverseOnce("Invalid map coordinates. Please try another point.");
      return;
    }

    const { lat, lng } = coords;

    setSelectedPost(null);
    setMarker({ lat, lng });
    setLabel("");
    setReverseStatus("Looking up location…");

    setSelectedPlace(
      {
        lat,
        lng,
        locationName: "",
        displayName: "",
        city: null,
        country: null
      },
      "click"
    );

    if (reverseAbortRef.current) reverseAbortRef.current.abort();

    const controller = new AbortController();
    reverseAbortRef.current = controller;

    const reqId = (reverseReqIdRef.current += 1);

    try {
      const result = await reverseGeocode(lat, lng, controller.signal);

      if (reqId !== reverseReqIdRef.current) return;

      if (result) {
        setSelectedPlace(result, "click");
        setLabel(result.locationName || result.displayName || "");
        setReverseStatus("");
      } else {
        setReverseStatus("Could not resolve an address for this point.");
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

      const status = err?.response?.status;
      const msg = err?.response?.data?.message;

      if (status === 429) {
        const m = msg || "Too many requests. Please slow down.";
        setReverseStatus(m);
        toastReverseOnce(m);
      } else if (status === 503) {
        const m = msg || "Geocoding service busy. Try again shortly.";
        setReverseStatus(m);
        toastReverseOnce(m);
      } else {
        setReverseStatus("Reverse geocoding failed. You can try another point.");
        toastReverseOnce("Reverse geocoding failed.");
      }
    } finally {
      if (reqId === reverseReqIdRef.current && reverseAbortRef.current === controller) {
        reverseAbortRef.current = null;
      }
    }
  }

  const footerMessage = useMemo(() => {
    if (reverseStatus) return reverseStatus;
    if (postsError) return postsError;
    if (isPostsLoading) return "Loading posts in current view…";
    if (countInBounds === 0) {
      return "No posts in this area yet. Move the map or click a point to reverse geocode.";
    }
    return `${countInBounds} post${countInBounds === 1 ? "" : "s"} in view. Click a pin for details.`;
  }, [reverseStatus, postsError, isPostsLoading, countInBounds]);

  const lightboxImages = Array.isArray(selectedPostDetails?.images)
    ? selectedPostDetails.images.filter((img) => img?.secureUrl)
    : [];

  return (
    <>
      <div className="map-page-shell relative w-full">
        <MapContainer center={center} zoom={zoom} className="h-full w-full bg-slate-900">
          <FlyToCenter center={center} zoom={zoom} />
          <TileLayer attribution={ATTRIBUTION} url={TILE_URL} />
          <MapViewportReporter onViewportChange={handleViewportChange} />
          <ClickHandler onPick={onMapPick} />

          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={80}
            spiderfyOnMaxZoom
            showCoverageOnHover={false}
            zoomToBoundsOnClick
            iconCreateFunction={createClusterIcon}
          >
            {mapPosts.map((post) => {
            const coords = getFiniteLatLng(post?.latitude, post?.longitude);

            if (!post?.id || !coords) {
              return null;
            }

            return (
              <Marker
                key={post.id}
                position={[coords.lat, coords.lng]}
                icon={getPostMarkerIcon(
                  post.sentiment,
                  post.placeCategory,
                  selectedPost?.id === post.id
                )}
                postSentiment={post.sentiment}
                eventHandlers={{
                  click: () => {
                    setSelectedPost(post);
                  }
                }}
              >
                <Tooltip direction="top" offset={[0, -22]} opacity={1}>
                  {post.title || "Untitled post"}
                </Tooltip>
              </Marker>
            );
          })}
          </MarkerClusterGroup>

          {markerCoordsForRender && (
            <Marker position={[markerCoordsForRender.lat, markerCoordsForRender.lng]}>
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">Selected</div>
                  <div className="mt-1">{label || "—"}</div>
                  <div className="mt-2 text-slate-600">
                    {markerCoordsForRender.lat.toFixed(5)}, {markerCoordsForRender.lng.toFixed(5)}
                  </div>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        <div className="pointer-events-none absolute right-6 top-6 z-[1200]">
          <div className="pointer-events-auto rounded-2xl bg-white/15 px-5 py-4 text-white shadow-xl backdrop-blur-xl">
            <div className="text-sm font-semibold">Map</div>
            <div className="mt-1 text-sm text-white/80">
              Click the map to reverse geocode or click a pin to open a post.
            </div>

            <div className="mt-4 border-t border-white/15 pt-3 text-sm text-white/85">
              <div className="font-medium">Marker legend</div>

              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full bg-emerald-500" />
                  <span>Positive sentiment</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full bg-amber-500" />
                  <span>Neutral sentiment</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full bg-rose-500" />
                  <span>Negative sentiment</span>
                </div>
              </div>

              <div className="mt-3 text-xs text-white/75">
                The letter inside each pin shows place category:
              </div>

              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-white/85">
                <span>H = Historical</span>
                <span>R = Religious</span>
                <span>N = Nature</span>
                <span>E = Entertainment</span>
                <span>F = Food &amp; Drink</span>
                <span>S = Shopping</span>
                <span>U = Urban Landmark</span>
                <span>O = Other</span>
              </div>
            </div>
          </div>
        </div>

        <MapPostPanel
          post={selectedPost}
          details={selectedPostDetails}
          detailsLoading={selectedPostDetailsLoading}
          detailsError={selectedPostDetailsError}
          aiState={selectedAiState}
          aiRemainingSeconds={aiRemainingSeconds}
          isOpen={Boolean(selectedPost)}
          onClose={() => setSelectedPost(null)}
          onOpenLightbox={(index) => setLightboxIndex(index)}
          onRequestLearnMore={() => requestLearnMore(selectedPost, selectedPostDetails)}
        />

        <div className="pointer-events-none absolute bottom-6 left-1/2 z-[1200] -translate-x-1/2">
          <div className="pointer-events-auto rounded-2xl bg-white/15 px-5 py-3 text-sm text-white/85 shadow-xl backdrop-blur-xl">
            {footerMessage}
          </div>
        </div>
      </div>

      <Lightbox
        images={lightboxImages}
        currentIndex={lightboxIndex}
        title={selectedPost?.title}
        getImageUrl={(url) => optimizeCloudinaryUrl(url, "full")}
        onClose={() => setLightboxIndex(-1)}
        onPrev={() => {
          if (!lightboxImages.length) return;
          setLightboxIndex((prev) => (prev <= 0 ? lightboxImages.length - 1 : prev - 1));
        }}
        onNext={() => {
          if (!lightboxImages.length) return;
          setLightboxIndex((prev) => (prev >= lightboxImages.length - 1 ? 0 : prev + 1));
        }}
      />
    </>
  );
}
