import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CollectionData, GameId } from "./types";

const COLLECTION_KEY = "cardvault_collection";

export async function getCollection(): Promise<CollectionData> {
  try {
    const data = await AsyncStorage.getItem(COLLECTION_KEY);
    if (data) return JSON.parse(data);
    return {};
  } catch {
    return {};
  }
}

export async function saveCollection(collection: CollectionData): Promise<void> {
  await AsyncStorage.setItem(COLLECTION_KEY, JSON.stringify(collection));
}

export async function addCardToCollection(
  game: GameId,
  setId: string,
  cardId: string,
  quantity: number = 1
): Promise<CollectionData> {
  const collection = await getCollection();
  if (!collection[game]) collection[game] = {};
  if (!collection[game][setId]) collection[game][setId] = [];
  for (let i = 0; i < quantity; i++) {
    collection[game][setId].push(cardId);
  }
  await saveCollection(collection);
  return JSON.parse(JSON.stringify(collection));
}

export async function removeCardFromCollection(
  game: GameId,
  setId: string,
  cardId: string
): Promise<CollectionData> {
  const collection = await getCollection();
  if (collection[game]?.[setId]) {
    const cardIdLower = cardId.toLowerCase();
    const stripZeros = (s: string) => s.replace(/^0+/, "") || "0";
    collection[game][setId] = collection[game][setId].filter((id) => {
      if (id === cardId) return false;
      if (id.toLowerCase() === cardIdLower) return false;
      const storedNum = id.toLowerCase().split("-").pop() || "";
      const cardNum = cardIdLower.split("-").pop() || "";
      if (storedNum && cardNum && stripZeros(storedNum) === stripZeros(cardNum) && id.toLowerCase().startsWith(setId.toLowerCase())) return false;
      return true;
    });
    if (collection[game][setId].length === 0) delete collection[game][setId];
    if (Object.keys(collection[game]).length === 0) delete collection[game];
  }
  await saveCollection(collection);
  return JSON.parse(JSON.stringify(collection));
}

export async function clearSetFromCollection(
  game: GameId,
  setId: string
): Promise<CollectionData> {
  const collection = await getCollection();
  if (collection[game]?.[setId]) {
    delete collection[game][setId];
    if (Object.keys(collection[game]).length === 0) delete collection[game];
  }
  await saveCollection(collection);
  return JSON.parse(JSON.stringify(collection));
}

export async function removeOneCardFromCollection(
  game: GameId,
  setId: string,
  cardId: string
): Promise<CollectionData> {
  const collection = await getCollection();
  if (collection[game]?.[setId]) {
    const cardIdLower = cardId.toLowerCase();
    const stripZeros = (s: string) => s.replace(/^0+/, "") || "0";
    const idx = collection[game][setId].findIndex((id) => {
      if (id === cardId || id.toLowerCase() === cardIdLower) return true;
      const storedNum = id.toLowerCase().split("-").pop() || "";
      const cardNum = cardIdLower.split("-").pop() || "";
      return storedNum && cardNum && stripZeros(storedNum) === stripZeros(cardNum) && id.toLowerCase().startsWith(setId.toLowerCase());
    });
    if (idx !== -1) {
      collection[game][setId].splice(idx, 1);
      if (collection[game][setId].length === 0) delete collection[game][setId];
      if (Object.keys(collection[game]).length === 0) delete collection[game];
    }
  }
  await saveCollection(collection);
  return JSON.parse(JSON.stringify(collection));
}

export function getCollectedCount(collection: CollectionData, game?: GameId): number {
  let count = 0;
  const games = game ? [game] : Object.keys(collection);
  for (const g of games) {
    if (!collection[g]) continue;
    for (const setId of Object.keys(collection[g])) {
      count += new Set(collection[g][setId].map((c) => c.toLowerCase())).size;
    }
  }
  return count;
}

export function getSetCollectedCount(
  collection: CollectionData,
  game: GameId,
  setId: string
): number {
  const cards = collection[game]?.[setId];
  if (!cards) return 0;
  return new Set(cards.map((c) => c.toLowerCase())).size;
}

export function getCardQuantity(
  collection: CollectionData,
  game: GameId,
  setId: string,
  cardId: string
): number {
  const cards = collection[game]?.[setId];
  if (!cards || cards.length === 0) return 0;
  const cardIdLower = cardId.toLowerCase();
  const stripZeros = (s: string) => s.replace(/^0+/, "") || "0";
  let count = 0;
  for (const stored of cards) {
    const storedLower = stored.toLowerCase();
    if (storedLower === cardIdLower) { count++; continue; }
    const storedNum = storedLower.split("-").pop() || "";
    const cardNum = cardIdLower.split("-").pop() || "";
    if (storedNum && cardNum && stripZeros(storedNum) === stripZeros(cardNum) && storedLower.startsWith(setId.toLowerCase())) count++;
  }
  return count;
}

export function isCardCollected(
  collection: CollectionData,
  game: GameId,
  setId: string,
  cardId: string
): boolean {
  const cards = collection[game]?.[setId];
  if (!cards || cards.length === 0) return false;
  if (cards.includes(cardId)) return true;
  const cardIdLower = cardId.toLowerCase();
  const stripZeros = (s: string) => s.replace(/^0+/, "") || "0";
  for (const stored of cards) {
    const storedLower = stored.toLowerCase();
    if (storedLower === cardIdLower) return true;
    const storedNum = storedLower.split("-").pop() || "";
    const cardNum = cardIdLower.split("-").pop() || "";
    if (storedNum && cardNum && stripZeros(storedNum) === stripZeros(cardNum) && storedLower.startsWith(setId.toLowerCase())) return true;
  }
  return false;
}

const SET_ORDER_KEY = "cardvault_set_order";

export async function getSetOrder(game: GameId): Promise<string[]> {
  try {
    const data = await AsyncStorage.getItem(`${SET_ORDER_KEY}_${game}`);
    if (data) return JSON.parse(data);
    return [];
  } catch {
    return [];
  }
}

export async function saveSetOrder(game: GameId, order: string[]): Promise<void> {
  await AsyncStorage.setItem(`${SET_ORDER_KEY}_${game}`, JSON.stringify(order));
}
