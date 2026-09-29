"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => undefined;

/** Vrai uniquement côté navigateur après hydratation (APIs navigateur : Bluetooth, micro…). */
export function useMounted(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
