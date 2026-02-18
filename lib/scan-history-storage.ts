import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GameId, CardIdentification } from "./types";

const SCAN_HISTORY_KEY = "cardvault_scan_history";
const MAX_HISTORY = 50;

export interface ScanHistoryItem {
  id: string;
  game: GameId;
  name: string;
  setName: string;
  setId: string;
  cardNumber: string;
  rarity: string;
  estimatedValue: number;
  imageUri?: string;
  scannedAt: number;
  addedToCollection: boolean;
}

export async function getScanHistory(): Promise<ScanHistoryItem[]> {
  try {
    const data = await AsyncStorage.getItem(SCAN_HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function addToScanHistory(
  result: CardIdentification,
  addedToCollection: boolean
): Promise<ScanHistoryItem[]> {
  const history = await getScanHistory();
  const item: ScanHistoryItem = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    game: result.game,
    name: result.name,
    setName: result.setName,
    setId: result.setId,
    cardNumber: result.cardNumber,
    rarity: result.rarity,
    estimatedValue: result.estimatedValue,
    scannedAt: Date.now(),
    addedToCollection,
  };
  history.unshift(item);
  if (history.length > MAX_HISTORY) history.pop();
  await AsyncStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify(history));
  return history;
}

export async function clearScanHistory(): Promise<void> {
  await AsyncStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify([]));
}
