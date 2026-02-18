import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform,
  Pressable,
  ActivityIndicator,
  Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/ThemeContext";
import { useCollection } from "@/lib/CollectionContext";
import { apiRequest } from "@/lib/query-client";
import { GameSelector } from "@/components/GameSelector";
import { SetCard } from "@/components/SetCard";
import { StatCard } from "@/components/StatCard";
import type { GameId, TCGSet } from "@/lib/types";
import { GAMES } from "@/lib/types";

interface ValueResponse {
  totalValue: number;
  cards: { cardId: string; name: string; price: number | null }[];
  dailyChange: number;
}

function formatCurrency(value: number): string {
  return "$" + value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export default function CollectionScreen() {
  const insets = useSafeAreaInsets();
  const { colors, toggle, isDark } = useTheme();
  const [selectedGame, setSelectedGame] = useState<GameId>("pokemon");
  const { totalCards, setCards, collection } = useCollection();

  const [valueData, setValueData] = useState<ValueResponse | null>(null);
  const [valueLoading, setValueLoading] = useState(false);
  const valueFetchRef = useRef(0);

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

  const allCardsRef = useRef(allCards);
  allCardsRef.current = allCards;

  const allCardsKey = useMemo(() => {
    return allCards.map(c => `${c.game}:${c.cardId}`).sort().join(",");
  }, [allCards]);

  useEffect(() => {
    const currentCards = allCardsRef.current;
    if (currentCards.length === 0) {
      setValueData(null);
      setValueLoading(false);
      return;
    }
    const fetchId = ++valueFetchRef.current;
    setValueLoading(true);
    apiRequest("POST", "/api/collection/value", { cards: currentCards })
      .then(async (res) => {
        if (fetchId === valueFetchRef.current) {
          const data = await res.json();
          setValueData(data);
        }
      })
      .catch(() => {
        if (fetchId === valueFetchRef.current) setValueData(null);
      })
      .finally(() => {
        if (fetchId === valueFetchRef.current) setValueLoading(false);
      });
  }, [allCardsKey]);

  const { data: sets, isLoading } = useQuery<TCGSet[]>({
    queryKey: [`/api/tcg/${selectedGame}/sets`],
  });

  const collectedSets =
    sets?.filter(
      (s) => (collection[selectedGame]?.[s.id]?.length || 0) > 0
    ) || [];

  const inProgressSets = collectedSets.filter(
    (s) =>
      s.totalCards > 0 &&
      (collection[selectedGame]?.[s.id]?.length || 0) < s.totalCards
  );

  const completedSets = collectedSets.filter(
    (s) =>
      s.totalCards > 0 &&
      (collection[selectedGame]?.[s.id]?.length || 0) >= s.totalCards
  );

  const setsStartedForGame = useMemo(() => {
    const gameSets = collection[selectedGame];
    if (!gameSets) return 0;
    let count = 0;
    for (const setId of Object.keys(gameSets)) {
      if (gameSets[setId]?.length > 0) count++;
    }
    return count;
  }, [collection, selectedGame]);

  const uniqueSetsStarted = useMemo(() => {
    let count = 0;
    for (const game of Object.keys(collection)) {
      const sets = collection[game];
      if (!sets) continue;
      for (const setId of Object.keys(sets)) {
        if (sets[setId]?.length > 0) count++;
      }
    }
    return count;
  }, [collection]);

  const mostValuableCard = useMemo(() => {
    if (!valueData?.cards?.length) return null;
    let best: { cardId: string; name: string; price: number | null } | null =
      null;
    for (const c of valueData.cards) {
      if (c.price != null && (best == null || (best.price ?? 0) < c.price)) {
        best = c;
      }
    }
    return best;
  }, [valueData]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 84 + 34 : 100;

  const gameColor =
    GAMES.find((g) => g.id === selectedGame)?.color || colors.tint;

  const navigateToSet = (setId: string) => {
    router.push({
      pathname: "/set/[game]/[id]",
      params: { game: selectedGame, id: setId },
    });
  };

  const handleExport = async () => {
    const total = totalCards();
    let message = `My CardVault Collection\n========================\nTotal Cards: ${total}\n`;

    for (const game of GAMES) {
      const gameData = collection[game.id];
      if (!gameData) continue;
      const gameTotal = totalCards(game.id);
      if (gameTotal === 0) continue;
      message += `\n${game.name} (${gameTotal} cards):\n`;
      for (const setId of Object.keys(gameData)) {
        const count = gameData[setId]?.length ?? 0;
        if (count > 0) {
          message += `  - Set ${setId}: ${count} cards\n`;
        }
      }
    }

    message += `\nTracked with CardVault`;

    try {
      await Share.share({ message });
    } catch (_) {}
  };

  const dailyChange = valueData?.dailyChange ?? 0;
  const dailyPct =
    valueData && valueData.totalValue > 0
      ? (dailyChange / (valueData.totalValue - dailyChange)) * 100
      : 0;
  const changePositive = dailyChange >= 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: bottomInset }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.topBar, { paddingTop: topInset + 8 }]}>
        <View style={styles.topBarRow}>
          <View style={styles.topBarTitles}>
            <Text style={[styles.greeting, { color: colors.text }]}>
              My Collection
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {totalCards()} cards collected
            </Text>
          </View>
          <View style={styles.topBarActions}>
            <Pressable onPress={handleExport} hitSlop={8}>
              <Ionicons name="share-outline" size={22} color={colors.text} />
            </Pressable>
            <Pressable onPress={toggle} hitSlop={8}>
              <Ionicons
                name={isDark ? "sunny-outline" : "moon-outline"}
                size={22}
                color={colors.text}
              />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <StatCard
          icon="layers"
          label="Cards"
          value={String(totalCards(selectedGame))}
          color={gameColor}
        />
        <StatCard
          icon="albums"
          label="Sets"
          value={String(setsStartedForGame)}
          color={gameColor}
        />
        <StatCard
          icon="star"
          label="Complete"
          value={String(completedSets.length)}
          color={colors.success}
        />
      </View>

      <View style={styles.valueBannerWrapper}>
        <View
          style={[
            styles.valueBanner,
            {
              backgroundColor: gameColor,
            },
          ]}
        >
          <View style={[styles.valueBannerOverlay, { backgroundColor: gameColor + "CC" }]} />
          <View style={styles.valueBannerContent}>
            <View style={styles.valueBannerTop}>
              <Ionicons name="diamond" size={18} color="rgba(255,255,255,0.85)" />
              <Text style={styles.valueBannerLabel}>Estimated Value</Text>
            </View>
            {valueLoading ? (
              <View style={styles.valueSkeletonRow}>
                <View style={styles.valueSkeleton} />
              </View>
            ) : (
              <>
                <Text style={styles.valueBannerAmount}>
                  {valueData
                    ? formatCurrency(valueData.totalValue)
                    : "$0.00"}
                </Text>
                <View style={styles.valueBannerChangeRow}>
                  <Ionicons
                    name={changePositive ? "trending-up" : "trending-down"}
                    size={16}
                    color={
                      changePositive
                        ? "rgba(180,255,200,0.95)"
                        : "rgba(255,180,170,0.95)"
                    }
                  />
                  <Text
                    style={[
                      styles.valueBannerChange,
                      {
                        color: changePositive
                          ? "rgba(180,255,200,0.95)"
                          : "rgba(255,180,170,0.95)",
                      },
                    ]}
                  >
                    {changePositive ? "+" : ""}
                    {formatCurrency(Math.abs(dailyChange))} (
                    {changePositive ? "+" : ""}
                    {dailyPct.toFixed(1)}%) today
                  </Text>
                </View>
              </>
            )}
          </View>
          <View
            style={[
              styles.valueBannerCircle,
              { backgroundColor: "rgba(255,255,255,0.08)" },
            ]}
          />
          <View
            style={[
              styles.valueBannerCircle2,
              { backgroundColor: "rgba(255,255,255,0.05)" },
            ]}
          />
        </View>
      </View>

      <View style={styles.selectorRow}>
        <GameSelector selected={selectedGame} onSelect={setSelectedGame} />
      </View>

      <View style={styles.statsDashboard}>
        <Text style={[styles.dashboardTitle, { color: colors.text }]}>
          Collection Stats
        </Text>
        <View style={styles.dashboardGrid}>
          <View
            style={[
              styles.dashboardCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <Ionicons name="trophy" size={20} color={colors.tint} />
            <Text
              style={[styles.dashboardCardLabel, { color: colors.textSecondary }]}
            >
              Most Valuable
            </Text>
            <Text
              style={[styles.dashboardCardValue, { color: colors.text }]}
              numberOfLines={1}
            >
              {mostValuableCard?.name ?? "—"}
            </Text>
            <Text style={[styles.dashboardCardSub, { color: colors.tint }]}>
              {mostValuableCard?.price != null
                ? formatCurrency(mostValuableCard.price)
                : "N/A"}
            </Text>
          </View>
          <View
            style={[
              styles.dashboardCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <Ionicons name="grid" size={20} color={colors.accent} />
            <Text
              style={[styles.dashboardCardLabel, { color: colors.textSecondary }]}
            >
              Unique Sets
            </Text>
            <Text style={[styles.dashboardCardValue, { color: colors.text }]}>
              {uniqueSetsStarted}
            </Text>
            <Text
              style={[styles.dashboardCardSub, { color: colors.textTertiary }]}
            >
              across all games
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.perGameCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <View style={styles.perGameRow}>
            {GAMES.map((game) => {
              const count = totalCards(game.id);
              return (
                <View key={game.id} style={styles.perGameItem}>
                  <View
                    style={[
                      styles.perGameDot,
                      { backgroundColor: game.color },
                    ]}
                  />
                  <Text
                    style={[styles.perGameName, { color: colors.textSecondary }]}
                  >
                    {game.name}
                  </Text>
                  <Text style={[styles.perGameCount, { color: colors.text }]}>
                    {count}
                  </Text>
                </View>
              );
            })}
          </View>
          <View style={[styles.perGameTotal, { borderTopColor: colors.cardBorder }]}>
            <View style={styles.perGameTotalRow}>
              <Ionicons name="cube" size={14} color={colors.tint} />
              <Text style={[styles.perGameTotalLabel, { color: colors.text }]}>
                Total Cards
              </Text>
              <Text style={[styles.perGameTotalCount, { color: colors.tint }]}>
                {totalCards()}
              </Text>
            </View>
            <View style={styles.perGameTotalRow}>
              <Ionicons name="diamond" size={14} color={colors.accent} />
              <Text style={[styles.perGameTotalLabel, { color: colors.text }]}>
                Total Value
              </Text>
              <Text style={[styles.perGameTotalCount, { color: colors.accent }]}>
                {valueLoading ? "..." : valueData ? formatCurrency(valueData.totalValue) : "$0.00"}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {isLoading && (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      )}

      {!isLoading && collectedSets.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons
            name="albums-outline"
            size={48}
            color={colors.textTertiary}
          />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            No cards yet
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Scan your first card or browse sets to start building your
            collection
          </Text>
          <Pressable
            style={[styles.emptyButton, { backgroundColor: colors.tint }]}
            onPress={() => router.push("/(tabs)/scan")}
          >
            <Ionicons name="scan" size={18} color="#FFFFFF" />
            <Text style={styles.emptyButtonText}>Scan a Card</Text>
          </Pressable>
        </View>
      )}

      {inProgressSets.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="construct" size={18} color={gameColor} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Working On
            </Text>
            <View
              style={[
                styles.countBadge,
                { backgroundColor: gameColor + "18" },
              ]}
            >
              <Text style={[styles.countBadgeText, { color: gameColor }]}>
                {inProgressSets.length}
              </Text>
            </View>
          </View>
          <Text
            style={[styles.sectionSubtitle, { color: colors.textTertiary }]}
          >
            Sets you're actively collecting
          </Text>
          <View style={styles.setList}>
            {inProgressSets.map((item) => (
              <SetCard
                key={`${item.game}-${item.id}`}
                set={item}
                collectedCount={setCards(selectedGame, item.id)}
                onPress={() => navigateToSet(item.id)}
              />
            ))}
          </View>
        </View>
      )}

      {completedSets.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="trophy" size={18} color={colors.success} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Completed
            </Text>
            <View
              style={[
                styles.countBadge,
                { backgroundColor: colors.success + "18" },
              ]}
            >
              <Text
                style={[styles.countBadgeText, { color: colors.success }]}
              >
                {completedSets.length}
              </Text>
            </View>
          </View>
          <Text
            style={[styles.sectionSubtitle, { color: colors.textTertiary }]}
          >
            Master sets you've finished
          </Text>
          <View style={styles.setList}>
            {completedSets.map((item) => (
              <SetCard
                key={`${item.game}-${item.id}`}
                set={item}
                collectedCount={setCards(selectedGame, item.id)}
                onPress={() => navigateToSet(item.id)}
              />
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  topBarRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  topBarTitles: {
    flex: 1,
  },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingTop: 4,
  },
  greeting: {
    fontFamily: "DMSans_700Bold",
    fontSize: 28,
  },
  subtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  valueBannerWrapper: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  valueBanner: {
    borderRadius: 18,
    overflow: "hidden",
    position: "relative",
  },
  valueBannerOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  valueBannerContent: {
    padding: 20,
    zIndex: 1,
  },
  valueBannerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  valueBannerLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
  },
  valueBannerAmount: {
    fontFamily: "DMSans_700Bold",
    fontSize: 32,
    color: "#FFFFFF",
    marginBottom: 6,
  },
  valueBannerChangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  valueBannerChange: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
  },
  valueSkeletonRow: {
    marginTop: 4,
    marginBottom: 10,
  },
  valueSkeleton: {
    width: 160,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  valueBannerCircle: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    right: -20,
    top: -30,
  },
  valueBannerCircle2: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    right: 40,
    bottom: -20,
  },
  statsDashboard: {
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 12,
  },
  dashboardTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 18,
  },
  dashboardGrid: {
    flexDirection: "row",
    gap: 10,
  },
  dashboardCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    gap: 4,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  dashboardCardLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    marginTop: 4,
  },
  dashboardCardValue: {
    fontFamily: "DMSans_700Bold",
    fontSize: 16,
  },
  dashboardCardSub: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
  },
  perGameCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  perGameRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
  },
  perGameItem: {
    alignItems: "center" as const,
    gap: 4,
    flex: 1,
  },
  perGameDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  perGameName: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
  },
  perGameCount: {
    fontFamily: "DMSans_700Bold",
    fontSize: 16,
  },
  perGameTotal: {
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  perGameTotalRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  perGameTotalLabel: {
    flex: 1,
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
  },
  perGameTotalCount: {
    fontFamily: "DMSans_700Bold",
    fontSize: 15,
  },
  selectorRow: {
    marginBottom: 8,
  },
  section: {
    marginTop: 20,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 17,
    flex: 1,
  },
  sectionSubtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    paddingHorizontal: 20,
    marginTop: -4,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  countBadgeText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
  },
  setList: {
    gap: 10,
  },
  loadingState: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 18,
  },
  emptyText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  emptyButtonText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: "#FFFFFF",
  },
});
