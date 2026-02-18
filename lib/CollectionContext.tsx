import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from "react";
import type { CollectionData, GameId } from "./types";
import {
  getCollection,
  saveCollection,
  addCardToCollection,
  removeCardFromCollection,
  getCollectedCount,
  getSetCollectedCount,
  isCardCollected,
  getCardQuantity,
} from "./collection-storage";
import { apiRequest, getApiUrl } from "./query-client";
import { useAuth } from "./AuthContext";
import { fetch } from "expo/fetch";

interface CollectionContextValue {
  collection: CollectionData;
  loading: boolean;
  addCard: (game: GameId, setId: string, cardId: string, quantity?: number) => Promise<void>;
  removeCard: (game: GameId, setId: string, cardId: string) => Promise<void>;
  totalCards: (game?: GameId) => number;
  setCards: (game: GameId, setId: string) => number;
  hasCard: (game: GameId, setId: string, cardId: string) => boolean;
  cardQuantity: (game: GameId, setId: string, cardId: string) => number;
  refresh: () => Promise<void>;
  syncCollection: () => Promise<void>;
  loadFromCloud: () => Promise<void>;
}

const CollectionContext = createContext<CollectionContextValue | null>(null);

export function CollectionProvider({ children }: { children: ReactNode }) {
  const [collection, setCollection] = useState<CollectionData>({});
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevUserRef = useRef<string | null>(null);

  const syncToServer = useCallback(async (data: CollectionData) => {
    try {
      await apiRequest("POST", "/api/collection/sync", { collection: data });
    } catch {}
  }, []);

  const debouncedSync = useCallback((data: CollectionData) => {
    if (!user) return;
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      syncToServer(data);
    }, 1500);
  }, [user, syncToServer]);

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

  const addCard = useCallback(async (game: GameId, setId: string, cardId: string, quantity: number = 1) => {
    const updated = await addCardToCollection(game, setId, cardId, quantity);
    setCollection(updated);
    debouncedSync(updated);
  }, [debouncedSync]);

  const removeCard = useCallback(async (game: GameId, setId: string, cardId: string) => {
    const updated = await removeCardFromCollection(game, setId, cardId);
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
  }, []);

  const value = useMemo(
    () => ({ collection, loading, addCard, removeCard, totalCards, setCards, hasCard, cardQuantity, refresh: loadCollection, syncCollection, loadFromCloud }),
    [collection, loading, addCard, removeCard, totalCards, setCards, hasCard, cardQuantity, loadCollection, syncCollection, loadFromCloud]
  );

  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>;
}

export function useCollection() {
  const ctx = useContext(CollectionContext);
  if (!ctx) throw new Error("useCollection must be used within CollectionProvider");
  return ctx;
}
