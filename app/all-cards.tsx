import React, { useState, useMemo, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Platform,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/ThemeContext";
import { useCollection } from "@/lib/CollectionContext";
import { apiRequest } from "@/lib/query-client";
import type { GameId } from "@/lib/types";
import { GAMES } from "@/lib/types";

interface CardWithMeta {
  game: string;
  setId: string;
  cardId: string;
  quantity: number;
}

interface CardPriceInfo {
  cardId: string;
  name: string;
  price: number | null;
}

function gameLabel(game: string): string {
  return GAMES.find((g) => g.id === game)?.name || game;
}

function gameColor(game: string): string {
  return GAMES.find((g) => g.id === game)?.color || "#888";
}

function CardRow({
  card,
  priceInfo,
  colors,
  onDelete,
  onPress,
}: {
  card: CardWithMeta;
  priceInfo?: CardPriceInfo;
  colors: any;
  onDelete: () => void;
  onPress: () => void;
}) {
  const displayName = priceInfo?.name || card.cardId;
  const price = priceInfo?.price;

  return (
    <Pressable
      style={[
        styles.cardRow,
        { backgroundColor: colors.surface, borderColor: colors.cardBorder },
      ]}
      onPress={onPress}
    >
      <View style={[styles.gameDot, { backgroundColor: gameColor(card.game) }]} />
      <View style={styles.cardInfo}>
        <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={[styles.cardMeta, { color: colors.textTertiary }]} numberOfLines={1}>
          {gameLabel(card.game)} · {card.setId}
          {card.quantity > 1 ? ` · x${card.quantity}` : ""}
        </Text>
      </View>
      <View style={styles.cardRight}>
        {price != null ? (
          <Text style={[styles.cardPrice, { color: colors.tint }]}>
            ${price.toFixed(2)}
          </Text>
        ) : (
          <Text style={[styles.cardPrice, { color: colors.textTertiary }]}>—</Text>
        )}
        <Pressable
          style={[styles.deleteBtn, { backgroundColor: colors.danger + "15" }]}
          onPress={(e) => {
            e.stopPropagation?.();
            onDelete();
          }}
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={16} color={colors.danger || "#E53E3E"} />
        </Pressable>
      </View>
    </Pressable>
  );
}

export default function AllCardsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { collection, removeOneCard, cardQuantity } = useCollection();
  const [filterGame, setFilterGame] = useState<GameId | "all">("all");

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const allCards = useMemo(() => {
    const cards: CardWithMeta[] = [];
    const seen = new Map<string, CardWithMeta>();
    for (const game of Object.keys(collection)) {
      const gameSets = collection[game];
      if (!gameSets) continue;
      for (const setId of Object.keys(gameSets)) {
        const cardIds = gameSets[setId];
        if (!cardIds) continue;
        for (const cardId of cardIds) {
          const key = `${game}:${setId}:${cardId}`;
          const existing = seen.get(key);
          if (existing) {
            existing.quantity++;
          } else {
            const entry = { game, setId, cardId, quantity: 1 };
            seen.set(key, entry);
            cards.push(entry);
          }
        }
      }
    }
    return cards;
  }, [collection]);

  const filteredCards = useMemo(() => {
    if (filterGame === "all") return allCards;
    return allCards.filter((c) => c.game === filterGame);
  }, [allCards, filterGame]);

  const cardListForValue = useMemo(() => {
    return allCards.map((c) => ({ game: c.game, cardId: c.cardId }));
  }, [allCards]);

  const { data: valueData } = useQuery<{
    totalValue: number;
    cards: CardPriceInfo[];
  }>({
    queryKey: ["/api/collection/value", cardListForValue],
    queryFn: async () => {
      if (cardListForValue.length === 0)
        return { totalValue: 0, cards: [], dailyChange: 0 };
      const res = await apiRequest("POST", "/api/collection/value", {
        cards: cardListForValue,
      });
      return res.json();
    },
    enabled: cardListForValue.length > 0,
  });

  const priceMap = useMemo(() => {
    const map = new Map<string, CardPriceInfo>();
    if (valueData?.cards) {
      for (const c of valueData.cards) {
        map.set(c.cardId, c);
      }
    }
    return map;
  }, [valueData]);

  const handleDelete = useCallback(
    (card: CardWithMeta) => {
      const name = priceMap.get(card.cardId)?.name || card.cardId;
      Alert.alert(
        "Remove Card",
        `Remove one copy of "${name}" from your collection?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              await removeOneCard(card.game as GameId, card.setId, card.cardId);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            },
          },
        ]
      );
    },
    [removeOneCard, priceMap]
  );

  const handleCardPress = useCallback((card: CardWithMeta) => {
    router.push({
      pathname: "/card/[game]/[cardId]",
      params: { game: card.game, cardId: card.cardId },
    });
  }, []);

  const totalValue = useMemo(() => {
    if (!valueData?.cards) return 0;
    let total = 0;
    for (const c of filteredCards) {
      const info = priceMap.get(c.cardId);
      if (info?.price != null) total += info.price * c.quantity;
    }
    return Math.round(total * 100) / 100;
  }, [valueData, filteredCards, priceMap]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.headerTitles}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              All Cards
            </Text>
            <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
              {filteredCards.length} unique · ${totalValue.toFixed(2)} value
            </Text>
          </View>
        </View>

        <View style={styles.filterRow}>
          {[
            { id: "all" as const, label: "All" },
            ...GAMES.map((g) => ({ id: g.id, label: g.name })),
          ].map((opt) => {
            const active = filterGame === opt.id;
            return (
              <Pressable
                key={opt.id}
                style={[
                  styles.filterChip,
                  { backgroundColor: active ? colors.tint : colors.surfaceAlt },
                ]}
                onPress={() => setFilterGame(opt.id as any)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: active ? "#FFF" : colors.textSecondary },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {filteredCards.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="albums-outline" size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No cards in your collection yet
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredCards}
          keyExtractor={(item) => `${item.game}:${item.setId}:${item.cardId}`}
          contentContainerStyle={{ paddingBottom: bottomInset + 20, paddingHorizontal: 16 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <CardRow
              card={item}
              priceInfo={priceMap.get(item.cardId)}
              colors={colors}
              onDelete={() => handleDelete(item)}
              onPress={() => handleCardPress(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitles: { flex: 1 },
  headerTitle: { fontFamily: "DMSans_700Bold", fontSize: 24 },
  headerSub: { fontFamily: "DMSans_400Regular", fontSize: 13, marginTop: 2 },
  filterRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  filterChipText: { fontFamily: "DMSans_600SemiBold", fontSize: 13 },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  gameDot: { width: 8, height: 8, borderRadius: 4 },
  cardInfo: { flex: 1, gap: 2 },
  cardName: { fontFamily: "DMSans_600SemiBold", fontSize: 15 },
  cardMeta: { fontFamily: "DMSans_400Regular", fontSize: 12 },
  cardRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardPrice: { fontFamily: "DMSans_700Bold", fontSize: 15 },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyText: { fontFamily: "DMSans_400Regular", fontSize: 14, textAlign: "center" },
});
