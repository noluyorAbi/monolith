"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Reads a media query without a render-then-correct pass. Subscribing through
 * useSyncExternalStore is what React 19 wants for browser state that lives
 * outside it, and it keeps the server snapshot explicit rather than guessed.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // Rendered on the server there is no viewport, so assume the narrow case
    // and let hydration widen it.
    () => false,
  );
}
