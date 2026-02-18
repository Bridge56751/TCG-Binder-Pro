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
  cardId: string
): Promise<CollectionData> {
  const collection = await getCollection();
  if (!collection[game]) collection[game] = {};
  if (!collection[game][setId]) collection[game][setId] = [];
  if (!collection[game][setId].includes(cardId)) {
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
    collection[game][setId] = collection[game][setId].filter((id) => id !== cardId);
    if (collection[game][setId].length === 0) delete collection[game][setId];
    if (Object.keys(collection[game]).length === 0) delete collection[game];
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
      count += collection[g][setId].length;
    }
  }
  return count;
}

export function getSetCollectedCount(
  collection: CollectionData,
  game: GameId,
  setId: string
): number {
  return collection[game]?.[setId]?.length || 0;
}

export function isCardCollected(
  collection: CollectionData,
  game: GameId,
  setId: string,
  cardId: string
): boolean {
  return collection[game]?.[setId]?.includes(cardId) || false;
}
