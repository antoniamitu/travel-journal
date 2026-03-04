// frontend/src/pages/MapPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { api } from "../api/axios.js";
import { useLocationContext } from "../hooks/useLocationContext.js";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

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

export default function MapPage() {
  const { selectedPlace, selectionSource, setSelectedPlace } = useLocationContext();

  const [marker, setMarker] = useState(null);
  const [label, setLabel] = useState("");
  const [reverseStatus, setReverseStatus] = useState("");

  const reverseAbortRef = useRef(null);
  const reverseReqIdRef = useRef(0);

  const lastReverseToastAtRef = useRef(0);
  function toastReverseOnce(msg) {
    const now = Date.now();
    if (now - lastReverseToastAtRef.current < 1500) return;
    lastReverseToastAtRef.current = now;
    toast.error(msg);
  }

  useEffect(() => {
    return () => {
      if (reverseAbortRef.current) reverseAbortRef.current.abort();
    };
  }, []);

  const center = useMemo(() => {
    if (selectedPlace?.lat != null && selectedPlace?.lng != null) {
      return [Number(selectedPlace.lat), Number(selectedPlace.lng)];
    }
    if (marker?.lat != null && marker?.lng != null) return [marker.lat, marker.lng];
    return [45.9432, 24.9668];
  }, [selectedPlace, marker]);

  const zoom = useMemo(() => {
    // ✅ Real distinction:
    // - selected from search -> 14
    // - clicked on map -> 13
    if (selectedPlace?.lat != null && selectedPlace?.lng != null) {
      if (selectionSource === "click") return 13;
      return 14; // default (search)
    }
    if (marker?.lat != null && marker?.lng != null) return 13;
    return 6;
  }, [selectedPlace, marker, selectionSource]);

  useEffect(() => {
    // Sync marker/label when selectedPlace changes (from search or reverse)
    if (selectedPlace?.lat == null || selectedPlace?.lng == null) return;

    const lat = Number(selectedPlace.lat);
    const lng = Number(selectedPlace.lng);

    setMarker({ lat, lng });
    setLabel(selectedPlace.locationName || selectedPlace.displayName || "");
    setReverseStatus("");

    // ✅ CRITICAL FIX:
    // Only cancel in-flight reverse if this update came from SEARCH.
    // Click-sourced updates include a skeleton setSelectedPlace(mid-reverse) and must NOT abort.
    if (selectionSource === "search") {
      if (reverseAbortRef.current) reverseAbortRef.current.abort();
      reverseAbortRef.current = null;
      reverseReqIdRef.current += 1;
    }
  }, [selectedPlace, selectionSource]);

  async function reverseGeocode(lat, lng, signal) {
    const res = await api.post("/geocode/reverse", { lat, lng }, { timeout: 15000, signal });
    return res?.data?.result || null;
  }

  async function onMapPick(latlng) {
    const lat = Number(latlng.lat);
    const lng = Number(latlng.lng);

    setMarker({ lat, lng });
    setLabel("");
    setReverseStatus("Looking up location…");

    // ✅ Immediately sync "global" location to prevent stale data in Feed
    // IMPORTANT: mark source="click" so useEffect does NOT abort the in-flight reverse.
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

    // Cancel previous reverse and create a new controller
    if (reverseAbortRef.current) reverseAbortRef.current.abort();
    reverseAbortRef.current = new AbortController();

    // reqId guard: only the latest click can win
    const reqId = (reverseReqIdRef.current += 1);

    try {
      const result = await reverseGeocode(lat, lng, reverseAbortRef.current.signal);

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
      if (reqId === reverseReqIdRef.current) {
        reverseAbortRef.current = null;
      }
    }
  }

  const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  return (
    <div className="relative h-[calc(100vh-72px)] w-full">
      <MapContainer center={center} zoom={zoom} className="h-full w-full bg-slate-900">
        <FlyToCenter center={center} zoom={zoom} />
        <TileLayer attribution={ATTRIBUTION} url={TILE_URL} />
        <ClickHandler onPick={onMapPick} />

        {marker && (
          <Marker position={[marker.lat, marker.lng]}>
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">Selected</div>
                <div className="mt-1">{label || "—"}</div>
                <div className="mt-2 text-slate-600">
                  {marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}
                </div>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      <div className="pointer-events-none absolute right-6 top-6 z-[1200]">
        <div className="pointer-events-auto rounded-2xl bg-white/15 px-5 py-4 text-white backdrop-blur-xl shadow-xl">
          <div className="text-sm font-semibold">Map</div>
          <div className="mt-1 text-sm text-white/80">
            Search in the top bar or click the map to reverse geocode.
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-6 left-1/2 z-[1200] -translate-x-1/2">
        <div className="pointer-events-auto rounded-2xl bg-white/15 px-5 py-3 text-sm text-white/85 backdrop-blur-xl shadow-xl">
          {reverseStatus ? reverseStatus : "Tip: click any point to reverse geocode."}
        </div>
      </div>
    </div>
  );
}