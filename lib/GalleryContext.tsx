import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import type { GalleryCard } from "@/components/CardGallery";

interface GalleryState {
  cards: GalleryCard[];
  initialIndex: number;
  visible: boolean;
}

interface GalleryContextValue {
  gallery: GalleryState;
  openGallery: (cards: GalleryCard[], startIndex: number) => void;
  closeGallery: () => void;
  setGalleryCards: (cards: GalleryCard[]) => void;
  galleryCardsRef: React.MutableRefObject<GalleryCard[]>;
}

const GalleryContext = createContext<GalleryContextValue>({
  gallery: { cards: [], initialIndex: 0, visible: false },
  openGallery: () => {},
  closeGallery: () => {},
  setGalleryCards: () => {},
  galleryCardsRef: { current: [] },
});

export function GalleryProvider({ children }: { children: React.ReactNode }) {
  const [gallery, setGallery] = useState<GalleryState>({
    cards: [],
    initialIndex: 0,
    visible: false,
  });
  const galleryCardsRef = useRef<GalleryCard[]>([]);

  const openGallery = useCallback((cards: GalleryCard[], startIndex: number) => {
    setGallery({ cards, initialIndex: startIndex, visible: true });
  }, []);

  const closeGallery = useCallback(() => {
    setGallery((prev) => ({ ...prev, visible: false }));
  }, []);

  const setGalleryCards = useCallback((cards: GalleryCard[]) => {
    galleryCardsRef.current = cards;
  }, []);

  return (
    <GalleryContext.Provider value={{ gallery, openGallery, closeGallery, setGalleryCards, galleryCardsRef }}>
      {children}
    </GalleryContext.Provider>
  );
}

export function useGallery() {
  return useContext(GalleryContext);
}
