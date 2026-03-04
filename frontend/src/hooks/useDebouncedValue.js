// frontend/src/hooks/useDebouncedValue.js
import { useEffect, useState } from "react";

/**
 * useDebouncedValue
 * Returns a debounced version of `value` that updates after `delayMs`.
 */
export function useDebouncedValue(value, delayMs = 500) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}