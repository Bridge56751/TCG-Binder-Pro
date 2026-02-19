import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform,
  Pressable,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/ThemeContext";
import { useCollection } from "@/lib/CollectionContext";
import { apiRequest } from "@/lib/query-client";
import { GAMES, type GameId } from "@/lib/types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface ValueCard {
  cardId: string;
  name: string;
  price: number | null;
  game?: string;
}

interface ValueResponse {
  totalValue: number;
  cards: ValueCard[];
  dailyChange: number;
}

function formatCurrency(value: number): string {
  return "$" + value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { totalCards, collection } = useCollection();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [valueData, setValueData] = useState<ValueResponse | null>(null);
  const [valueLoading, setValueLoading] = useState(true);

  const allCards = useMemo(() => {
    const cards: { game: string; cardId: string }[] = [];
    for (const game of Object.keys(collection)) {
      const gameSets = collection[game];
      if (!gameSets) continue;
      for (const setId of Object.keys(gameSets)) {
        const cardIds = gameSets[setId];
        if (!cardIds) continue;
        for (const cardId of cardIds) {
          cards.push({ game, cardId });
        }
      }
    }
    return cards;
  }, [collection]);

  useEffect(() => {
    if (allCards.length === 0) {
      setValueData(null);
      setValueLoading(false);
      return;
    }
    setValueLoading(true);
    apiRequest("POST", "/api/collection/value", { cards: allCards })
      .then(async (res) => {
        const data = await res.json();
        setValueData(data);
      })
      .catch(() => setValueData(null))
      .finally(() => setValueLoading(false));
  }, []);

  const gameBreakdown = useMemo(() => {
    return GAMES.map((game) => {
      const count = totalCards(game.id);
      let value = 0;
      if (valueData?.cards) {
        const gameCardIds = new Set(
          allCards.filter((c) => c.game === game.id).map((c) => c.cardId)
        );
        for (const c of valueData.cards) {
          if (gameCardIds.has(c.cardId) && c.price != null) {
            value += c.price;
          }
        }
      }
      return { ...game, count, value: Math.round(value * 100) / 100 };
    }).sort((a, b) => b.value - a.value);
  }, [collection, valueData, allCards]);

  const topCards = useMemo(() => {
    if (!valueData?.cards) return [];
    const withGame = valueData.cards
      .filter((c) => c.price != null && c.price > 0)
      .map((c) => {
        const match = allCards.find((ac) => ac.cardId === c.cardId);
        return { ...c, game: match?.game || "" };
      })
      .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
      .slice(0, 10);
    return withGame;
  }, [valueData, allCards]);

  const maxGameValue = useMemo(() => {
    return Math.max(...gameBreakdown.map((g) => g.value), 1);
  }, [gameBreakdown]);

  const totalCardCount = totalCards();
  const totalValue = valueData?.totalValue ?? 0;
  const dailyChange = valueData?.dailyChange ?? 0;
  const changePositive = dailyChange >= 0;
  const avgCardValue = totalCardCount > 0 && totalValue > 0 ? totalValue / totalCardCount : 0;

  const totalGamesUsed = gameBreakdown.filter((g) => g.count > 0).length;
  const maxBar = SCREEN_WIDTH - 140;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset + 20 }}
      >
        <View style={[styles.header, { paddingTop: topInset + 8 }]}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Collection Stats
          </Text>
          <View style={{ width: 32 }} />
        </View>

        <View style={styles.summaryRow}>
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: colors.tint,
              },
            ]}
          >
            <View style={styles.summaryCardOverlay} />
            <Ionicons name="diamond" size={20} color="rgba(255,255,255,0.9)" />
            <Text style={styles.summaryLabel}>Total Value</Text>
            <Text style={styles.summaryAmount}>
              {valueLoading ? "..." : formatCurrency(totalValue)}
            </Text>
            {!valueLoading && (
              <View style={styles.changeRow}>
                <Ionicons
                  name={changePositive ? "trending-up" : "trending-down"}
                  size={14}
                  color={
                    changePositive
                      ? "rgba(180,255,200,0.95)"
                      : "rgba(255,180,170,0.95)"
                  }
                />
                <Text
                  style={[
                    styles.changeText,
                    {
                      color: changePositive
                        ? "rgba(180,255,200,0.95)"
                        : "rgba(255,180,170,0.95)",
                    },
                  ]}
                >
                  {changePositive ? "+" : ""}
                  {formatCurrency(Math.abs(dailyChange))} today
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.quickStatsRow}>
          <View
            style={[
              styles.quickStat,
              { backgroundColor: colors.surface, borderColor: colors.cardBorder },
            ]}
          >
            <Ionicons name="layers" size={18} color={colors.tint} />
            <Text style={[styles.quickStatValue, { color: colors.text }]}>
              {totalCardCount}
            </Text>
            <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>
              Total Cards
            </Text>
          </View>
          <View
            style={[
              styles.quickStat,
              { backgroundColor: colors.surface, borderColor: colors.cardBorder },
            ]}
          >
            <Ionicons name="game-controller" size={18} color={colors.accent} />
            <Text style={[styles.quickStatValue, { color: colors.text }]}>
              {totalGamesUsed}
            </Text>
            <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>
              Games
            </Text>
          </View>
          <View
            style={[
              styles.quickStat,
              { backgroundColor: colors.surface, borderColor: colors.cardBorder },
            ]}
          >
            <Ionicons name="pricetag" size={18} color={colors.success} />
            <Text style={[styles.quickStatValue, { color: colors.text }]}>
              {valueLoading ? "..." : formatCurrency(avgCardValue)}
            </Text>
            <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>
              Avg Value
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Value by Game
          </Text>
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: colors.surface, borderColor: colors.cardBorder },
            ]}
          >
            {gameBreakdown.map((game) => (
              <View key={game.id} style={styles.barItem}>
                <View style={styles.barLabel}>
                  <View
                    style={[styles.barDot, { backgroundColor: game.color }]}
                  />
                  <Text
                    style={[styles.barName, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {game.name}
                  </Text>
                  <Text
                    style={[styles.barValue, { color: colors.textSecondary }]}
                  >
                    {formatCurrency(game.value)}
                  </Text>
                </View>
                <View
                  style={[styles.barTrack, { backgroundColor: colors.surfaceAlt }]}
                >
                  <View
                    style={[
                      styles.barFill,
                      {
                        backgroundColor: game.color,
                        width:
                          game.value > 0
                            ? `${Math.max((game.value / maxGameValue) * 100, 3)}%`
                            : "0%",
                      },
                    ]}
                  />
                </View>
                <Text
                  style={[styles.barCardCount, { color: colors.textTertiary }]}
                >
                  {game.count} cards
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Card Distribution
          </Text>
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: colors.surface, borderColor: colors.cardBorder },
            ]}
          >
            {totalCardCount > 0 ? (
              <View style={styles.distRow}>
                {gameBreakdown
                  .filter((g) => g.count > 0)
                  .map((game) => {
                    const pct = (game.count / totalCardCount) * 100;
                    return (
                      <View key={game.id} style={styles.distItem}>
                        <View style={styles.distBarOuter}>
                          <View
                            style={[
                              styles.distBarInner,
                              {
                                backgroundColor: game.color,
                                height: `${Math.max(pct, 5)}%`,
                              },
                            ]}
                          />
                        </View>
                        <Text
                          style={[
                            styles.distPct,
                            { color: colors.text },
                          ]}
                        >
                          {Math.round(pct)}%
                        </Text>
                        <View
                          style={[styles.distDot, { backgroundColor: game.color }]}
                        />
                        <Text
                          style={[
                            styles.distName,
                            { color: colors.textSecondary },
                          ]}
                          numberOfLines={1}
                        >
                          {game.name.split(" ")[0]}
                        </Text>
                      </View>
                    );
                  })}
              </View>
            ) : (
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                No cards in collection yet
              </Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Most Valuable Cards
          </Text>
          {valueLoading ? (
            <ActivityIndicator
              size="small"
              color={colors.tint}
              style={{ marginTop: 20 }}
            />
          ) : topCards.length > 0 ? (
            <View
              style={[
                styles.sectionCard,
                { backgroundColor: colors.surface, borderColor: colors.cardBorder },
              ]}
            >
              {topCards.map((card, index) => {
                const gameInfo = GAMES.find((g) => g.id === card.game);
                return (
                  <Pressable
                    key={card.cardId}
                    style={[
                      styles.topCardRow,
                      index < topCards.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: colors.cardBorder,
                      },
                    ]}
                    onPress={() =>
                      router.push(`/card/${card.game}/${card.cardId}`)
                    }
                  >
                    <View
                      style={[
                        styles.topCardRank,
                        {
                          backgroundColor:
                            index === 0
                              ? "#F5C842"
                              : index === 1
                              ? "#C0C0C0"
                              : index === 2
                              ? "#CD7F32"
                              : colors.surfaceAlt,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.topCardRankText,
                          {
                            color: index < 3 ? "#FFFFFF" : colors.textSecondary,
                          },
                        ]}
                      >
                        {index + 1}
                      </Text>
                    </View>
                    <View style={styles.topCardInfo}>
                      <Text
                        style={[styles.topCardName, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {card.name}
                      </Text>
                      {gameInfo && (
                        <View style={styles.topCardGameRow}>
                          <View
                            style={[
                              styles.topCardGameDot,
                              { backgroundColor: gameInfo.color },
                            ]}
                          />
                          <Text
                            style={[
                              styles.topCardGameText,
                              { color: colors.textTertiary },
                            ]}
                          >
                            {gameInfo.name}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.topCardPrice, { color: colors.tint }]}>
                      {formatCurrency(card.price ?? 0)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View
              style={[
                styles.sectionCard,
                { backgroundColor: colors.surface, borderColor: colors.cardBorder },
              ]}
            >
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                No priced cards yet
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontFamily: "DMSans_700Bold",
    fontSize: 22,
    textAlign: "center",
  },
  summaryRow: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  summaryCard: {
    borderRadius: 18,
    padding: 20,
    overflow: "hidden",
    position: "relative",
  },
  summaryCardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  summaryLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    marginTop: 6,
  },
  summaryAmount: {
    fontFamily: "DMSans_700Bold",
    fontSize: 36,
    color: "#FFFFFF",
    marginTop: 4,
  },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  changeText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
  },
  quickStatsRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 24,
  },
  quickStat: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
  },
  quickStatValue: {
    fontFamily: "DMSans_700Bold",
    fontSize: 18,
  },
  quickStatLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  sectionTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 18,
  },
  sectionCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
  },
  barItem: {
    marginBottom: 14,
    gap: 6,
  },
  barLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  barDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  barName: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 14,
    flex: 1,
  },
  barValue: {
    fontFamily: "DMSans_700Bold",
    fontSize: 14,
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
  },
  barCardCount: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
  },
  distRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
    height: 160,
    paddingTop: 10,
  },
  distItem: {
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  distBarOuter: {
    width: 28,
    height: 100,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.04)",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  distBarInner: {
    width: "100%",
    borderRadius: 14,
  },
  distPct: {
    fontFamily: "DMSans_700Bold",
    fontSize: 13,
  },
  distDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  distName: {
    fontFamily: "DMSans_400Regular",
    fontSize: 10,
  },
  emptyText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 20,
  },
  topCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  topCardRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  topCardRankText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 12,
  },
  topCardInfo: {
    flex: 1,
    gap: 2,
  },
  topCardName: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 14,
  },
  topCardGameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  topCardGameDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  topCardGameText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
  },
  topCardPrice: {
    fontFamily: "DMSans_700Bold",
    fontSize: 15,
  },
});
