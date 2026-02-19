import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from "react";
import type { CollectionData, GameId } from "./types";
import {
  getCollection,
  saveCollection,
  addCardToCollection,
  removeCardFromCollection,
  removeOneCardFromCollection,
  clearSetFromCollection,
  getCollectedCount,
  getSetCollectedCount,
  isCardCollected,
  getCardQuantity,
} from "./collection-storage";
import { getCachedSets, type CachedSet } from "./card-cache";
import { apiRequest, getApiUrl } from "./query-client";
import { useAuth } from "./AuthContext";
import { fetch } from "expo/fetch";

type SyncStatus = "idle" | "syncing" | "error" | "success";

export interface ProgressToastData {
  setName: string;
  collected: number;
  total: number;
  game: GameId;
}

interface CollectionContextValue {
  collection: CollectionData;
  loading: boolean;
  addCard: (game: GameId, setId: string, cardId: string, quantity?: number) => Promise<void>;
  removeCard: (game: GameId, setId: string, cardId: string) => Promise<void>;
  removeOneCard: (game: GameId, setId: string, cardId: string) => Promise<void>;
  clearSet: (game: GameId, setId: string) => Promise<void>;
  totalCards: (game?: GameId) => number;
  setCards: (game: GameId, setId: string) => number;
  hasCard: (game: GameId, setId: string, cardId: string) => boolean;
  cardQuantity: (game: GameId, setId: string, cardId: string) => number;
  refresh: () => Promise<void>;
  syncCollection: () => Promise<void>;
  loadFromCloud: () => Promise<void>;
  syncStatus: SyncStatus;
  lastSyncTime: number | null;
  exportCollection: () => Promise<string>;
  importCollection: (jsonData: string) => Promise<{ success: boolean; error?: string }>;
  progressToast: ProgressToastData | null;
  clearProgressToast: () => void;
}

const CollectionContext = createContext<CollectionContextValue | null>(null);

const MAX_SYNC_RETRIES = 3;
const SYNC_RETRY_DELAY = 2000;

export function CollectionProvider({ children }: { children: ReactNode }) {
  const [collection, setCollection] = useState<CollectionData>({});
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const { user } = useAuth();
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevUserRef = useRef<string | null>(null);
  const syncRetryRef = useRef(0);
  const pendingSyncRef = useRef<CollectionData | null>(null);
  const isSyncingRef = useRef(false);
  const [progressToast, setProgressToast] = useState<ProgressToastData | null>(null);
  const progressToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSync = useCallback(async (data: CollectionData): Promise<boolean> => {
    try {
      setSyncStatus("syncing");
      await apiRequest("POST", "/api/collection/sync", { collection: data });
      setSyncStatus("success");
      setLastSyncTime(Date.now());
      syncRetryRef.current = 0;
      setTimeout(() => setSyncStatus((prev) => prev === "success" ? "idle" : prev), 3000);
      return true;
    } catch {
      return false;
    }
  }, []);

  const processSync = useCallback(async (data: CollectionData) => {
    if (isSyncingRef.current) {
      pendingSyncRef.current = data;
      return;
    }
    isSyncingRef.current = true;

    let success = await performSync(data);

    if (!success) {
      for (let attempt = 1; attempt <= MAX_SYNC_RETRIES; attempt++) {
        await new Promise((r) => setTimeout(r, SYNC_RETRY_DELAY * attempt));
        success = await performSync(pendingSyncRef.current || data);
        if (success) break;
      }
      if (!success) {
        setSyncStatus("error");
      }
    }

    isSyncingRef.current = false;

    if (pendingSyncRef.current) {
      const pending = pendingSyncRef.current;
      pendingSyncRef.current = null;
      processSync(pending);
    }
  }, [performSync]);

  const debouncedSync = useCallback((data: CollectionData) => {
    if (!user) return;
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      processSync(data);
    }, 1500);
  }, [user, processSync]);

  const loadCollection = useCallback(async () => {
    const data = await getCollection();
    setCollection(data);
    setLoading(false);
  }, []);

  const loadFromCloud = useCallback(async () => {
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/collection/sync", baseUrl);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.collection && Object.keys(data.collection).length > 0) {
          await saveCollection(data.collection);
          setCollection(data.collection);
          return;
        }
      }
    } catch {}
    await loadCollection();
  }, [loadCollection]);

  useEffect(() => {
    if (user && prevUserRef.current !== user.id) {
      prevUserRef.current = user.id;
      loadFromCloud();
    } else if (!user && prevUserRef.current) {
      prevUserRef.current = null;
      loadCollection();
    } else {
      loadCollection();
    }
  }, [user, loadCollection, loadFromCloud]);

  const showProgressToast = useCallback(async (game: GameId, setId: string, updatedCollection: CollectionData) => {
    try {
      const cachedSets = await getCachedSets(game);
      if (!cachedSets) return;
      const setInfo = cachedSets.find((s: CachedSet) => s.id === setId);
      if (!setInfo || !setInfo.totalCards) return;
      const collected = getSetCollectedCount(updatedCollection, game, setId);
      if (progressToastTimer.current) clearTimeout(progressToastTimer.current);
      setProgressToast({ setName: setInfo.name, collected, total: setInfo.totalCards, game });
      progressToastTimer.current = setTimeout(() => setProgressToast(null), 3000);
    } catch {}
  }, []);

  const clearProgressToast = useCallback(() => {
    if (progressToastTimer.current) clearTimeout(progressToastTimer.current);
    setProgressToast(null);
  }, []);

  const addCard = useCallback(async (game: GameId, setId: string, cardId: string, quantity: number = 1) => {
    const updated = await addCardToCollection(game, setId, cardId, quantity);
    setCollection(updated);
    debouncedSync(updated);
    showProgressToast(game, setId, updated);
  }, [debouncedSync, showProgressToast]);

  const removeCard = useCallback(async (game: GameId, setId: string, cardId: string) => {
    const updated = await removeCardFromCollection(game, setId, cardId);
    setCollection(updated);
    debouncedSync(updated);
  }, [debouncedSync]);

  const removeOneCard = useCallback(async (game: GameId, setId: string, cardId: string) => {
    const updated = await removeOneCardFromCollection(game, setId, cardId);
    setCollection(updated);
    debouncedSync(updated);
  }, [debouncedSync]);

  const clearSet = useCallback(async (game: GameId, setId: string) => {
    const updated = await clearSetFromCollection(game, setId);
    setCollection(updated);
    debouncedSync(updated);
  }, [debouncedSync]);

  const totalCards = useCallback(
    (game?: GameId) => getCollectedCount(collection, game),
    [collection]
  );

  const setCards = useCallback(
    (game: GameId, setId: string) => getSetCollectedCount(collection, game, setId),
    [collection]
  );

  const hasCard = useCallback(
    (game: GameId, setId: string, cardId: string) => isCardCollected(collection, game, setId, cardId),
    [collection]
  );

  const cardQuantity = useCallback(
    (game: GameId, setId: string, cardId: string) => getCardQuantity(collection, game, setId, cardId),
    [collection]
  );

  const syncCollection = useCallback(async () => {
    const currentData = await getCollection();
    await apiRequest("POST", "/api/collection/sync", { collection: currentData });
    setLastSyncTime(Date.now());
    setSyncStatus("success");
    setTimeout(() => setSyncStatus((prev) => prev === "success" ? "idle" : prev), 3000);
  }, []);

  const exportCollection = useCallback(async () => {
    const data = await getCollection();
    return JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      collection: data,
    }, null, 2);
  }, []);

  const importCollection = useCallback(async (jsonData: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const parsed = JSON.parse(jsonData);
      let collectionData: CollectionData;

      if (parsed.version && parsed.collection) {
        collectionData = parsed.collection;
      } else if (typeof parsed === "object" && !Array.isArray(parsed)) {
        collectionData = parsed;
      } else {
        return { success: false, error: "Invalid backup format" };
      }

      for (const game of Object.keys(collectionData)) {
        if (typeof collectionData[game] !== "object") {
          return { success: false, error: "Invalid collection structure" };
        }
      }

      await saveCollection(collectionData);
      setCollection(collectionData);
      debouncedSync(collectionData);
      return { success: true };
    } catch {
      return { success: false, error: "Could not parse backup file" };
    }
  }, [debouncedSync]);

  const value = useMemo(
    () => ({ collection, loading, addCard, removeCard, removeOneCard, clearSet, totalCards, setCards, hasCard, cardQuantity, refresh: loadCollection, syncCollection, loadFromCloud, syncStatus, lastSyncTime, exportCollection, importCollection, progressToast, clearProgressToast }),
    [collection, loading, addCard, removeCard, removeOneCard, clearSet, totalCards, setCards, hasCard, cardQuantity, loadCollection, syncCollection, loadFromCloud, syncStatus, lastSyncTime, exportCollection, importCollection, progressToast, clearProgressToast]
  );

  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>;
}

export function useCollection() {
  const ctx = useContext(CollectionContext);
  if (!ctx) throw new Error("useCollection must be used within CollectionProvider");
  return ctx;
}
