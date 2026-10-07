"use client";
import { useSyncExternalStore } from "react";
import { workspaceStore } from "../lib/workspace-store";

export function useWorkspace() {
  const snapshot = useSyncExternalStore(workspaceStore.subscribe, workspaceStore.getSnapshot, workspaceStore.getServerSnapshot);
  return { ...workspaceStore, ...snapshot };
}
