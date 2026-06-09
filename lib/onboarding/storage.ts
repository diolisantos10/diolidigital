// Persistence for tour completion — localStorage key: tour_completed_[tourId].
// Wrapped in try/catch: privacy modes can throw on storage access, and in that
// case we treat the tour as completed to avoid re-showing it on every render.

const KEY_PREFIX = "tour_completed_";

export function isTourCompleted(tourId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(KEY_PREFIX + tourId) === "true";
  } catch {
    return true;
  }
}

export function markTourCompleted(tourId: string): void {
  try {
    window.localStorage.setItem(KEY_PREFIX + tourId, "true");
  } catch {
    // storage unavailable — tour will re-offer next visit, acceptable
  }
}

export function resetTour(tourId: string): void {
  try {
    window.localStorage.removeItem(KEY_PREFIX + tourId);
  } catch {
    // ignore
  }
}
