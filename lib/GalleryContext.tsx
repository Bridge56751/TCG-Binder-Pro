import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import type { GalleryCard } from "@/components/CardGallery";

interface GalleryState {
  cards: GalleryCard[];
  initialIndex: number;
  visible: boolean;
  gameId: string;
}

interface GalleryContextValue {
  gallery: GalleryState;
  openGallery: (cards: GalleryCard[], startIndex: number, gameId?: string) => void;
  closeGallery: (lastIndex: number) => void;
  setGalleryCards: (cards: GalleryCard[]) => void;
  galleryCardsRef: React.MutableRefObject<GalleryCard[]>;
  lastClosedCardRef: React.MutableRefObject<GalleryCard | null>;
  gameIdRef: React.MutableRefObject<string>;
}

const GalleryContext = createContext<GalleryContextValue>({
  gallery: { cards: [], initialIndex: 0, visible: false, gameId: "" },
  openGallery: () => {},
  closeGallery: () => {},
  setGalleryCards: () => {},
  galleryCardsRef: { current: [] },
  lastClosedCardRef: { current: null },
  gameIdRef: { current: "" },
});

export function GalleryProvider({ children }: { children: React.ReactNode }) {
  const [gallery, setGallery] = useState<GalleryState>({
    cards: [],
    initialIndex: 0,
    visible: false,
    gameId: "",
  });
  const galleryCardsRef = useRef<GalleryCard[]>([]);
  const lastClosedCardRef = useRef<GalleryCard | null>(null);
  const gameIdRef = useRef<string>("");

  const openGallery = useCallback((cards: GalleryCard[], startIndex: number, gameId?: string) => {
    if (gameId) gameIdRef.current = gameId;
    setGallery({ cards, initialIndex: startIndex, visible: true, gameId: gameId || gameIdRef.current });
  }, []);

  const closeGallery = useCallback((lastIndex: number) => {
    setGallery((prev) => {
      const card = prev.cards[lastIndex] || null;
      lastClosedCardRef.current = card;
      return { ...prev, visible: false };
    });
  }, []);

  const setGalleryCards = useCallback((cards: GalleryCard[]) => {
    galleryCardsRef.current = cards;
  }, []);

  return (
    <GalleryContext.Provider value={{ gallery, openGallery, closeGallery, setGalleryCards, galleryCardsRef, lastClosedCardRef, gameIdRef }}>
      {children}
    </GalleryContext.Provider>
  );
}

export function useGallery() {
  return useContext(GalleryContext);
}
