// Device hints used to pick sensible defaults (layout and render quality) on phones and tablets.
import { useEffect, useState } from "react";

/** Touch-first device (phone / tablet): coarse pointer and touch support. */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return ("ontouchstart" in window || navigator.maxTouchPoints > 0) && window.matchMedia("(pointer: coarse)").matches;
}

const COMPACT_QUERY = "(max-width: 900px), (max-height: 520px), (pointer: coarse)";

/** Compact (phone-sized or touch) layout, updated when the window is resized or rotated. */
export function useCompact(): boolean {
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.matchMedia(COMPACT_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(COMPACT_QUERY);
    const on = () => setCompact(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return compact;
}

/** Phones and weak machines start with the lightweight renderer (no bloom, fewer particles). */
export function prefersLowQuality(): boolean {
  if (typeof navigator === "undefined") return false;
  const cores = navigator.hardwareConcurrency || 4;
  return isTouchDevice() || cores <= 4;
}
