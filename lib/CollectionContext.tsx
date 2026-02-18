import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, type ReactNode } from "react";
import type { CollectionData, GameId } from "./types";
import {
  getCollection,
  addCardToCollection,
  removeCardFromCollection,
  getCollectedCount,
  getSetCollectedCount,
  isCardCollected,
} from "./collection-storage";

interface CollectionContextValue {
  collection: CollectionData;
  loading: boolean;
  addCard: (game: GameId, setId: string, cardId: string) => Promise<void>;
  removeCard: (game: GameId, setId: string, cardId: string) => Promise<void>;
  totalCards: (game?: GameId) => number;
  setCards: (game: GameId, setId: string) => number;
  hasCard: (game: GameId, setId: string, cardId: string) => boolean;
  refresh: () => Promise<void>;
}

const CollectionContext = createContext<CollectionContextValue | null>(null);

export function CollectionProvider({ children }: { children: ReactNode }) {
  const [collection, setCollection] = useState<CollectionData>({});
  const [loading, setLoading] = useState(true);

  const loadCollection = useCallback(async () => {
    const data = await getCollection();
    setCollection(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCollection();
  }, [loadCollection]);

  const addCard = useCallback(async (game: GameId, setId: string, cardId: string) => {
    const updated = await addCardToCollection(game, setId, cardId);
    setCollection(updated);
  }, []);

  const removeCard = useCallback(async (game: GameId, setId: string, cardId: string) => {
    const updated = await removeCardFromCollection(game, setId, cardId);
    setCollection(updated);
  }, []);

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

  const value = useMemo(
    () => ({ collection, loading, addCard, removeCard, totalCards, setCards, hasCard, refresh: loadCollection }),
    [collection, loading, addCard, removeCard, totalCards, setCards, hasCard, loadCollection]
  );

  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>;
}

export function useCollection() {
  const ctx = useContext(CollectionContext);
  if (!ctx) throw new Error("useCollection must be used within CollectionProvider");
  return ctx;
}
