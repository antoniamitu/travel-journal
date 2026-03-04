// frontend/src/pages/FeedPage.jsx
import React from "react";
import { useLocationContext } from "../hooks/useLocationContext.js";

export default function FeedPage() {
  const { selectedPlace } = useLocationContext();

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Feed</h1>
          <p className="mt-2 text-slate-600">
            Placeholder. Posts will come later. For PRD #2 we focus on geocoding.
          </p>

          {selectedPlace && (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
              <div className="font-semibold text-emerald-900">Selected place</div>
              <div className="mt-1 text-emerald-800">
                {selectedPlace.locationName || selectedPlace.displayName || "—"}
                {selectedPlace.city || selectedPlace.country ? (
                  <>
                    {" "}
                    — {[selectedPlace.city, selectedPlace.country].filter(Boolean).join(", ")}
                  </>
                ) : null}
              </div>
              {selectedPlace.lat != null && selectedPlace.lng != null && (
                <div className="mt-2 text-emerald-900/70">
                  {Number(selectedPlace.lat).toFixed(5)}, {Number(selectedPlace.lng).toFixed(5)}
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">PRD #2 Checklist</div>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>• Forward geocoding search</li>
            <li>• Map + marker</li>
            <li>• Reverse geocoding on click</li>
            <li>• Keyboard-accessible autocomplete</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}