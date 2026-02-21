export type GameId = "pokemon" | "yugioh" | "onepiece" | "mtg";

export interface TCGGame {
  id: GameId;
  name: string;
  iconName: string;
  color: string;
}

export interface TCGSet {
  id: string;
  name: string;
  game: string;
  totalCards: number;
  logo?: string | null;
  symbol?: string | null;
  releaseDate?: string | null;
}

export interface TCGCard {
  id: string;
  localId: string;
  name: string;
  englishName?: string | null;
  image: string | null;
}

export interface SetDetail {
  id: string;
  name: string;
  totalCards: number;
  cards: TCGCard[];
}

export interface CardIdentification {
  game: GameId;
  name: string;
  englishName?: string;
  setName: string;
  englishSetName?: string;
  setId: string;
  cardNumber: string;
  rarity: string;
  estimatedValue: number;
  verifiedCardId?: string;
  verified?: boolean;
  language?: string;
  error?: string;
}

export interface CardDetail {
  id: string;
  localId: string;
  name: string;
  englishName?: string | null;
  image: string | null;
  game: GameId;
  setId: string;
  setName: string;
  englishSetName?: string | null;
  rarity: string | null;
  cardType: string | null;
  hp: number | null;
  description: string | null;
  artist: string | null;
  currentPrice: number | null;
  priceUnit: string;
  priceLow: number | null;
  priceHigh: number | null;
}

export interface CollectionData {
  [game: string]: {
    [setId: string]: string[];
  };
}

export const GAMES: TCGGame[] = [
  { id: "pokemon", name: "Pokemon", iconName: "pokeball", color: "#E3573E" },
  { id: "yugioh", name: "Yu-Gi-Oh!", iconName: "pyramid", color: "#7B5EA7" },
  { id: "onepiece", name: "One Piece", iconName: "anchor", color: "#2E86C1" },
  { id: "mtg", name: "Magic", iconName: "magic-staff", color: "#A8572E" },
];
