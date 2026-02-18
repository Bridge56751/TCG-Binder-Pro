import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GameId } from "./types";

const TRADE_KEY = "cardvault_tradelist";

export interface TradeItem {
  game: GameId;
  setId: string;
  cardId: string;
  addedAt: number;
}

export async function getTradeList(): Promise<TradeItem[]> {
  try {
    const data = await AsyncStorage.getItem(TRADE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function addToTradeList(game: GameId, setId: string, cardId: string): Promise<TradeItem[]> {
  const list = await getTradeList();
  if (!list.some(item => item.cardId === cardId && item.game === game)) {
    list.push({ game, setId, cardId, addedAt: Date.now() });
    await AsyncStorage.setItem(TRADE_KEY, JSON.stringify(list));
  }
  return list;
}

export async function removeFromTradeList(game: GameId, cardId: string): Promise<TradeItem[]> {
  let list = await getTradeList();
  list = list.filter(item => !(item.cardId === cardId && item.game === game));
  await AsyncStorage.setItem(TRADE_KEY, JSON.stringify(list));
  return list;
}

export function isOnTradeList(tradeList: TradeItem[], game: GameId, cardId: string): boolean {
  return tradeList.some(item => item.cardId === cardId && item.game === game);
}
