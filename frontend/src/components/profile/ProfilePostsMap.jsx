// frontend/src/components/profile/ProfilePostsMap.jsx
import React, { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import { getSentimentUi } from "../../utils/sentimentUi.js";
import { getPlaceCategoryUi, normalizePlaceCategory } from "../../utils/placeCategoryUi.js";

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const INITIAL_CENTER = [45.9432, 24.9668];
const INITIAL_ZOOM = 5;
const SINGLE_POST_ZOOM = 8;

const markerIconCache = new Map();

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

function getPostLocation(post) {
  const parts = [post?.city, post?.country].filter(
    (item) => typeof item === "string" && item.trim() !== ""
  );

  if (parts.length > 0) {
    return parts.join(", ");
  }

  return post?.locationName || "Unknown location";
}

function getPostMarkerIcon(sentiment, placeCategory, isActive = false) {
  const normalizedCategory = normalizePlaceCategory(placeCategory);
  const key = `${sentiment}:${normalizedCategory}:${isActive ? "active" : "idle"}`;
  const cached = markerIconCache.get(key);

  if (cached) {
    return cached;
  }

  const sentimentUi = getSentimentUi(sentiment);
  const categoryUi = getPlaceCategoryUi(normalizedCategory);

  const circleSize = isActive ? 30 : 26;
  const pointerHeight = isActive ? 13 : 11;
  const pointerHalf = isActive ? 7 : 6;

  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-2px);">
      <div
        style="
          width:${circleSize}px;
          height:${circleSize}px;
          border-radius:9999px;
          background:${sentimentUi.color};
          border:3px solid #ffffff;
          box-shadow:0 12px 24px rgba(15,23,42,0.26);
          display:flex;
          align-items:center;
          justify-content:center;
          color:#ffffff;
          font-size:${isActive ? "12px" : "11px"};
          font-weight:800;
          font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          letter-spacing:0.02em;
        "
      >
        ${categoryUi.shortLabel}
      </div>
      <div
        style="
          width:0;
          height:0;
          border-left:${pointerHalf}px solid transparent;
          border-right:${pointerHalf}px solid transparent;
          border-top:${pointerHeight}px solid ${sentimentUi.color};
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

    if (sentiment === "positive") {
      positive += 1;
    } else if (sentiment === "negative") {
      negative += 1;
    } else {
      neutral += 1;
    }
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

  const size = count < 10 ? 42 : count < 50 ? 48 : 54;

  const html = `
    <div
      style="
        width:${size}px;
        height:${size}px;
        border-radius:9999px;
        background:${ui.color};
        border:4px solid rgba(255,255,255,0.94);
        box-shadow:0 14px 28px rgba(15,23,42,0.24);
        display:flex;
        align-items:center;
        justify-content:center;
        color:#ffffff;
        font-weight:800;
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

function FitMapToPosts({ points }) {
  const map = useMap();
  const lastKeyRef = useRef("");

  const key = useMemo(() => {
    return points.map((point) => `${point.id}:${point.lat.toFixed(5)},${point.lng.toFixed(5)}`).join("|");
  }, [points]);

  useEffect(() => {
    if (!points.length || lastKeyRef.current === key) {
      return;
    }

    lastKeyRef.current = key;

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], SINGLE_POST_ZOOM, {
        animate: false
      });
      return;
    }

    const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng]));

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [42, 42],
        maxZoom: 8,
        animate: false
      });
    }
  }, [map, points, key]);

  return null;
}

export default function ProfilePostsMap({ posts = [] }) {
  const points = useMemo(() => {
    if (!Array.isArray(posts)) {
      return [];
    }

    return posts
      .map((post) => {
        const coords = getFiniteLatLng(post?.latitude, post?.longitude);

        if (!post?.id || !coords) {
          return null;
        }

        return {
          id: post.id,
          lat: coords.lat,
          lng: coords.lng,
          post
        };
      })
      .filter(Boolean);
  }, [posts]);

  if (points.length === 0) {
    return (
      <div className="rounded-[32px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-50 text-2xl">
          🗺️
        </div>
        <h3 className="mt-4 text-2xl font-semibold text-slate-900">No map pins yet</h3>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          Your posts will appear on this personal map once they have valid location coordinates.
        </p>
        <div className="mt-6">
          <Link
            to="/posts/new"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Create a Post
          </Link>
        </div>
      </div>
    );
  }

  const initialCenter = [points[0].lat, points[0].lng];
  const initialZoom = points.length === 1 ? SINGLE_POST_ZOOM : INITIAL_ZOOM;

  return (
    <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
            Personal map
          </div>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Your travel pins
          </h3>
        </div>

        <div className="inline-flex w-fit items-center rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 ring-1 ring-cyan-100">
          {points.length} {points.length === 1 ? "pin" : "pins"}
        </div>
      </div>

      <div className="h-[520px] w-full overflow-hidden bg-slate-100">
        <MapContainer center={initialCenter} zoom={initialZoom} className="h-full w-full">
          <FitMapToPosts points={points} />
          <TileLayer attribution={ATTRIBUTION} url={TILE_URL} />

          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={80}
            spiderfyOnMaxZoom
            showCoverageOnHover={false}
            zoomToBoundsOnClick
            iconCreateFunction={createClusterIcon}
          >
            {points.map(({ id, lat, lng, post }) => {
              const categoryUi = getPlaceCategoryUi(post?.placeCategory);
              const sentimentUi = getSentimentUi(post?.sentiment, post?.sentimentScore, "profile");

              return (
                <Marker
                  key={id}
                  position={[lat, lng]}
                  icon={getPostMarkerIcon(post?.sentiment, post?.placeCategory)}
                  postSentiment={post?.sentiment}
                >
                  <Tooltip direction="top" offset={[0, -22]} opacity={1}>
                    {post?.title || "Untitled post"}
                  </Tooltip>

                  <Popup>
                    <div className="w-56 text-sm">
                      <div className="line-clamp-2 font-semibold text-slate-900">
                        {post?.title || "Untitled post"}
                      </div>

                      <div className="mt-2 text-slate-600">📍 {getPostLocation(post)}</div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${sentimentUi.shell}`}>
                          {sentimentUi.emoji} {sentimentUi.label}
                        </span>

                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${categoryUi.shell}`}>
                          {categoryUi.icon} {categoryUi.label}
                        </span>
                      </div>

                     <Link
                      to={`/posts/${post.id}`}
                      className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-purple-600 px-3 py-2.5 text-xs !font-bold !text-white no-underline shadow-[0_12px_30px_rgba(139,92,246,0.28)] transition hover:-translate-y-0.5 hover:from-violet-700 hover:via-fuchsia-700 hover:to-purple-700 hover:shadow-[0_16px_36px_rgba(139,92,246,0.36)] hover:!text-white focus:outline-none focus:ring-4 focus:ring-violet-200"
                    >
                      Open post
                    </Link>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MarkerClusterGroup>
        </MapContainer>
      </div>
    </section>
  );
}