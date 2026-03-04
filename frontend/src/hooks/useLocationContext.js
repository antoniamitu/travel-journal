// frontend/src/hooks/useLocationContext.js
import { useContext } from "react";
import { LocationContext } from "../context/LocationContext.jsx";

export function useLocationContext() {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error("useLocationContext must be used inside <LocationProvider>");
  }
  return ctx;
}