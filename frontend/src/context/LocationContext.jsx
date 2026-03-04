// frontend/src/context/LocationContext.jsx
import React, { createContext, useCallback, useMemo, useState } from "react";

export const LocationContext = createContext(null);

/**
 * selectedPlace: object|null
 * selectionSource: "search" | "click" | null
 *
 * We keep "selectionSource" separate so Map zoom logic can distinguish
 * search selection vs map click.
 */
export function LocationProvider({ children }) {
  const [selectedPlace, setSelectedPlaceState] = useState(null);
  const [selectionSource, setSelectionSource] = useState(null);

  const setSelectedPlace = useCallback((place, source = null) => {
    setSelectedPlaceState(place || null);
    if (source) setSelectionSource(source);
  }, []);

  const clearSelectedPlace = useCallback(() => {
    setSelectedPlaceState(null);
    setSelectionSource(null);
  }, []);

  const value = useMemo(
    () => ({
      selectedPlace,
      selectionSource,
      setSelectedPlace,
      clearSelectedPlace
    }),
    [selectedPlace, selectionSource, setSelectedPlace, clearSelectedPlace]
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}