// frontend/src/utils/safeStorage.js

export function getStorageItem(key) {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setStorageItem(key, value) {
  if (typeof window === "undefined" || !window.localStorage) {
    return false;
  }

  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStorageItem(key) {
  if (typeof window === "undefined" || !window.localStorage) {
    return false;
  }

  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}