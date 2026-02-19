import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GameId } from "./types";

const CARD_CACHE_KEY = "cardvault_card_cache";
const SET_CACHE_KEY = "cardvault_set_cache";
const PRICE_CACHE_KEY = "cardvault_price_cache";

export interface CachedCard {
  id: string;
  localId: string;
  name: string;
  englishName?: string | null;
  image: string | null;
  game: GameId;
  setId: string;
  setName: string;
  rarity?: string | null;
  currentPrice?: number | null;
  cachedAt: number;
}

export interface CachedSet {
  id: string;
  name: string;
  game: string;
  totalCards: number;
  logo?: string | null;
  cachedAt: number;
}

export interface CachedPrices {
  [cardId: string]: { price: number | null; name: string; cachedAt: number };
}

let cardCacheMemory: Record<string, CachedCard> | null = null;
let setCacheMemory: Record<string, CachedSet[]> | null = null;
let priceCacheMemory: CachedPrices | null = null;

export async function getCardCache(): Promise<Record<string, CachedCard>> {
  if (cardCacheMemory) return cardCacheMemory;
  try {
    const data = await AsyncStorage.getItem(CARD_CACHE_KEY);
    cardCacheMemory = data ? JSON.parse(data) : {};
    return cardCacheMemory!;
  } catch {
    cardCacheMemory = {};
    return {};
  }
}

export async function cacheCard(card: CachedCard): Promise<void> {
  const cache = await getCardCache();
  const key = `${card.game}:${card.id}`;
  cache[key] = { ...card, cachedAt: Date.now() };
  cardCacheMemory = cache;
  await AsyncStorage.setItem(CARD_CACHE_KEY, JSON.stringify(cache));
}

export async function cacheCards(cards: CachedCard[]): Promise<void> {
  if (cards.length === 0) return;
  const cache = await getCardCache();
  const now = Date.now();
  for (const card of cards) {
    const key = `${card.game}:${card.id}`;
    cache[key] = { ...card, cachedAt: now };
  }
  cardCacheMemory = cache;
  await AsyncStorage.setItem(CARD_CACHE_KEY, JSON.stringify(cache));
}

export async function getCachedCard(game: GameId, cardId: string): Promise<CachedCard | null> {
  const cache = await getCardCache();
  return cache[`${game}:${cardId}`] || null;
}

export async function getCachedCardsForCollection(
  collection: Record<string, Record<string, string[]>>
): Promise<CachedCard[]> {
  const cache = await getCardCache();
  const results: CachedCard[] = [];
  for (const game of Object.keys(collection)) {
    const gameSets = collection[game];
    if (!gameSets) continue;
    for (const setId of Object.keys(gameSets)) {
      const cardIds = gameSets[setId];
      if (!cardIds) continue;
      const seen = new Set<string>();
      for (const cardId of cardIds) {
        const key = `${game}:${cardId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (cache[key]) {
          results.push(cache[key]);
        }
      }
    }
  }
  return results;
}

export async function getSetCache(): Promise<Record<string, CachedSet[]>> {
  if (setCacheMemory) return setCacheMemory;
  try {
    const data = await AsyncStorage.getItem(SET_CACHE_KEY);
    setCacheMemory = data ? JSON.parse(data) : {};
    return setCacheMemory!;
  } catch {
    setCacheMemory = {};
    return {};
  }
}

export async function cacheSets(game: string, sets: CachedSet[]): Promise<void> {
  const cache = await getSetCache();
  cache[game] = sets.map(s => ({ ...s, cachedAt: Date.now() }));
  setCacheMemory = cache;
  await AsyncStorage.setItem(SET_CACHE_KEY, JSON.stringify(cache));
}

export async function getCachedSets(game: string): Promise<CachedSet[] | null> {
  const cache = await getSetCache();
  return cache[game] || null;
}

export async function getPriceCache(): Promise<CachedPrices> {
  if (priceCacheMemory) return priceCacheMemory;
  try {
    const data = await AsyncStorage.getItem(PRICE_CACHE_KEY);
    priceCacheMemory = data ? JSON.parse(data) : {};
    return priceCacheMemory!;
  } catch {
    priceCacheMemory = {};
    return {};
  }
}

export async function cachePrices(prices: { cardId: string; name: string; price: number | null }[]): Promise<void> {
  const cache = await getPriceCache();
  const now = Date.now();
  for (const p of prices) {
    cache[p.cardId] = { price: p.price, name: p.name, cachedAt: now };
  }
  priceCacheMemory = cache;
  await AsyncStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(cache));
}

export async function getCachedPrices(): Promise<CachedPrices> {
  return getPriceCache();
}
