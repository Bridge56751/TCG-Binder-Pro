import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useFocusEffect, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/ThemeContext";
import { useCollection } from "@/lib/CollectionContext";
import { apiRequest, queryClient } from "@/lib/query-client";
import { GameSelector } from "@/components/GameSelector";
import { SetCard } from "@/components/SetCard";
import { StatCard } from "@/components/StatCard";
import { cachePrices, cacheSets, getCachedPrices, getCachedSets } from "@/lib/card-cache";
import { getSetOrder, saveSetOrder } from "@/lib/collection-storage";
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

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function CollectionScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [selectedGame, setSelectedGame] = useState<GameId>("pokemon");
  const { totalCards, setCards, collection, enabledGames } = useCollection();

  const [valueData, setValueData] = useState<ValueResponse | null>(null);
  const [valueLoading, setValueLoading] = useState(false);
  const valueFetchRef = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [customOrder, setCustomOrder] = useState<string[]>([]);
  const [pricesUpdatedAt, setPricesUpdatedAt] = useState<number | null>(null);
  const priceRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabledGames.includes(selectedGame) && enabledGames.length > 0) {
      setSelectedGame(enabledGames[0]);
    }
  }, [enabledGames, selectedGame]);

  const allCards = useMemo(() => {
    const cards: { game: string; cardId: string }[] = [];
    for (const game of Object.keys(collection)) {
      if (!enabledGames.includes(game as GameId)) continue;
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
  }, [collection, enabledGames]);

  const allCardsRef = useRef(allCards);
  allCardsRef.current = allCards;

  const allCardsKey = useMemo(() => {
    return allCards.map(c => `${c.game}:${c.cardId}`).sort().join(",");
  }, [allCards]);

  const [isOffline, setIsOffline] = useState(false);

  const fetchCollectionValue = useCallback((forceRefresh = false) => {
    const currentCards = allCardsRef.current;
    if (currentCards.length === 0) {
      setValueData(null);
      setValueLoading(false);
      return;
    }
    const fetchId = ++valueFetchRef.current;
    setValueLoading(true);
    apiRequest("POST", "/api/collection/value", { cards: currentCards, forceRefresh })
      .then(async (res) => {
        if (fetchId === valueFetchRef.current) {
          const data = await res.json();
          setValueData(data);
          setIsOffline(false);
          setPricesUpdatedAt(Date.now());
          if (data.cards) cachePrices(data.cards);
        }
      })
      .catch(async () => {
        if (fetchId === valueFetchRef.current) {
          setIsOffline(true);
          const cached = await getCachedPrices();
          const cachedCards = Object.entries(cached).map(([cardId, info]) => ({
            cardId, name: info.name, price: info.price,
          }));
          if (cachedCards.length > 0) {
            const total = cachedCards.reduce((sum, c) => sum + (c.price || 0), 0);
            setValueData({ totalValue: total, cards: cachedCards, dailyChange: 0 });
          } else {
            setValueData(null);
          }
        }
      })
      .finally(() => {
        if (fetchId === valueFetchRef.current) setValueLoading(false);
      });
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const startTime = Date.now();
    
    fetchCollectionValue(true);
    await queryClient.invalidateQueries({ queryKey: [`/api/tcg/${selectedGame}/sets`] });
    
    const elapsed = Date.now() - startTime;
    const remainingDelay = Math.max(1000 - elapsed, 0);
    
    if (remainingDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingDelay));
    }
    
    setRefreshing(false);
  }, [selectedGame, fetchCollectionValue]);

  useEffect(() => {
    fetchCollectionValue();
  }, [allCardsKey]);

  useFocusEffect(
    useCallback(() => {
      fetchCollectionValue();
      priceRefreshTimerRef.current = setInterval(() => {
        fetchCollectionValue(true);
      }, 15 * 60 * 1000);
      return () => {
        if (priceRefreshTimerRef.current) {
          clearInterval(priceRefreshTimerRef.current);
          priceRefreshTimerRef.current = null;
        }
      };
    }, [fetchCollectionValue])
  );

  const [cachedSetsFallback, setCachedSetsFallback] = useState<TCGSet[]>([]);

  const { data: sets, isLoading, isError: setsError } = useQuery<TCGSet[]>({
    queryKey: [`/api/tcg/${selectedGame}/sets`],
  });

  useEffect(() => {
    if (sets && sets.length > 0) {
      cacheSets(selectedGame, sets.map(s => ({
        id: s.id, name: s.name, game: s.game || selectedGame, totalCards: s.totalCards, logo: s.logo
      })));
    } else if (setsError || (!sets && !isLoading)) {
      getCachedSets(selectedGame).then(cached => {
        if (cached) setCachedSetsFallback(cached.map(s => ({ id: s.id, name: s.name, game: s.game, totalCards: s.totalCards, logo: s.logo })));
      });
    }
  }, [sets, selectedGame, setsError, isLoading]);

  const effectiveSets = sets || (cachedSetsFallback.length > 0 ? cachedSetsFallback : undefined);

  const { data: japaneseSets } = useQuery<TCGSet[]>({
    queryKey: [`/api/tcg/pokemon/sets?lang=ja`],
    enabled: selectedGame === "pokemon",
  });

  const japaneseSetIds = useMemo(() => {
    if (!japaneseSets) return new Set<string>();
    return new Set(japaneseSets.map((s) => s.id));
  }, [japaneseSets]);

  const combinedSets = useMemo(() => {
    if (selectedGame !== "pokemon" || !japaneseSets) return effectiveSets || [];
    const enSets = effectiveSets || [];
    const enIds = new Set(enSets.map((s) => s.id));
    const jaOnly = japaneseSets.filter((s) => !enIds.has(s.id));
    return [...enSets, ...jaOnly];
  }, [effectiveSets, japaneseSets, selectedGame]);

  const collectedSets =
    combinedSets.filter(
      (s) => (collection[selectedGame]?.[s.id]?.length || 0) > 0
    ) || [];

  useEffect(() => {
    getSetOrder(selectedGame).then(setCustomOrder);
    setReorderMode(false);
  }, [selectedGame]);

  const inProgressSetsRaw = collectedSets.filter(
    (s) =>
      s.totalCards > 0 &&
      (collection[selectedGame]?.[s.id]?.length || 0) < s.totalCards
  );

  const inProgressSets = useMemo(() => {
    if (customOrder.length === 0) return inProgressSetsRaw;
    const orderMap = new Map(customOrder.map((id, i) => [id, i]));
    return [...inProgressSetsRaw].sort((a, b) => {
      const ai = orderMap.get(a.id) ?? 9999;
      const bi = orderMap.get(b.id) ?? 9999;
      return ai - bi;
    });
  }, [inProgressSetsRaw, customOrder]);

  const moveSet = useCallback(async (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= inProgressSets.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newOrder = inProgressSets.map(s => s.id);
    [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
    setCustomOrder(newOrder);
    await saveSetOrder(selectedGame, newOrder);
  }, [inProgressSets, selectedGame]);

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
    if (!valueData?.cards?.length || !allCards.length) return null;
    const gameCardIds = new Set(
      allCards.filter(c => c.game === selectedGame).map(c => c.cardId)
    );
    let best: { cardId: string; name: string; price: number | null } | null =
      null;
    for (const c of valueData.cards) {
      if (gameCardIds.has(c.cardId) && c.price != null && (best == null || (best.price ?? 0) < c.price)) {
        best = c;
      }
    }
    return best;
  }, [valueData, allCards, selectedGame]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 84 + 34 : 100;

  const gameColor =
    GAMES.find((g) => g.id === selectedGame)?.color || colors.tint;

  const navigateToSet = (setId: string) => {
    const isJa = selectedGame === "pokemon" && japaneseSetIds.has(setId) && !(effectiveSets || []).find((s) => s.id === setId);
    router.push({
      pathname: "/set/[game]/[id]",
      params: { game: selectedGame, id: setId, lang: isJa ? "ja" : "en" },
    });
  };


  const gameValue = useMemo(() => {
    if (!valueData?.cards?.length || !allCards.length) return { total: 0, change: 0 };
    const gameCardIds = new Set(
      allCards.filter(c => c.game === selectedGame).map(c => c.cardId)
    );
    let total = 0;
    for (const c of valueData.cards) {
      if (gameCardIds.has(c.cardId) && c.price != null) {
        total += c.price;
      }
    }
    total = Math.round(total * 100) / 100;
    const ratio = valueData.totalValue > 0 ? total / valueData.totalValue : 0;
    const change = Math.round((valueData.dailyChange ?? 0) * ratio * 100) / 100;
    return { total, change };
  }, [valueData, allCards, selectedGame]);

  const dailyChange = gameValue.change;
  const dailyPct =
    gameValue.total > 0
      ? (dailyChange / (gameValue.total - dailyChange)) * 100
      : 0;
  const changePositive = dailyChange >= 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: bottomInset }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.tint} colors={[colors.tint]} />}
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
        </View>
      </View>

      {isOffline && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 20, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.textTertiary + "18" }}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.textSecondary} />
          <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.textSecondary, flex: 1 }}>
            Offline mode - showing cached data
          </Text>
        </View>
      )}

      <Pressable style={styles.statsRow} onPress={() => router.push({ pathname: "/all-cards", params: { game: selectedGame } })}>
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
      </Pressable>

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
                  {formatCurrency(gameValue.total)}
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

      {pricesUpdatedAt && (
        <Text style={[styles.pricesUpdatedText, { color: colors.textTertiary }]}>
          Prices updated {formatTimeAgo(pricesUpdatedAt)} — pull down to refresh
        </Text>
      )}

      <View style={styles.selectorRow}>
        <GameSelector selected={selectedGame} onSelect={setSelectedGame} />
      </View>

      <View style={styles.statsDashboard}>
        <Pressable style={styles.dashboardTitleRow} onPress={() => router.push("/stats")}>
          <Text style={[styles.dashboardTitle, { color: colors.text }]}>
            Collection Stats
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </Pressable>
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

      <View style={styles.binderSection}>
        <Pressable
          style={[styles.binderBtn, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
          onPress={() => router.push({ pathname: "/all-cards", params: { game: selectedGame } })}
        >
          <View style={[styles.binderBtnIcon, { backgroundColor: colors.tint + "18" }]}>
            <Ionicons name="albums" size={22} color={colors.tint} />
          </View>
          <View style={styles.binderBtnInfo}>
            <Text style={[styles.binderBtnTitle, { color: colors.text }]}>View My Binder</Text>
            <Text style={[styles.binderBtnSub, { color: colors.textSecondary }]}>
              Browse all your cards with images and sorting
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
        </Pressable>
      </View>

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
            <View style={{ flex: 1 }} />
            {inProgressSets.length > 1 && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setReorderMode(prev => !prev);
                }}
                hitSlop={8}
              >
                <Ionicons
                  name={reorderMode ? "checkmark-circle" : "reorder-three"}
                  size={22}
                  color={reorderMode ? colors.success : colors.textTertiary}
                />
              </Pressable>
            )}
          </View>
          <Text
            style={[styles.sectionSubtitle, { color: colors.textTertiary }]}
          >
            {reorderMode ? "Tap arrows to reorder" : "Sets you're actively collecting"}
          </Text>
          <View style={styles.setList}>
            {inProgressSets.map((item, idx) => (
              <View key={`${item.game}-${item.id}`} style={styles.reorderRow}>
                {reorderMode && (
                  <View style={styles.reorderControls}>
                    <Pressable
                      onPress={() => moveSet(idx, -1)}
                      style={[styles.reorderButton, { backgroundColor: colors.surfaceAlt, opacity: idx === 0 ? 0.3 : 1 }]}
                      hitSlop={4}
                      disabled={idx === 0}
                    >
                      <Ionicons name="chevron-up" size={18} color={colors.text} />
                    </Pressable>
                    <Pressable
                      onPress={() => moveSet(idx, 1)}
                      style={[styles.reorderButton, { backgroundColor: colors.surfaceAlt, opacity: idx === inProgressSets.length - 1 ? 0.3 : 1 }]}
                      hitSlop={4}
                      disabled={idx === inProgressSets.length - 1}
                    >
                      <Ionicons name="chevron-down" size={18} color={colors.text} />
                    </Pressable>
                  </View>
                )}
                <View style={[{ flex: 1 }, reorderMode && { marginLeft: -8 }]}>
                  <SetCard
                    set={item}
                    collectedCount={setCards(selectedGame, item.id)}
                    onPress={() => reorderMode ? undefined : navigateToSet(item.id)}
                  />
                </View>
              </View>
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
  pricesUpdatedText: {
    fontSize: 11,
    textAlign: "center" as const,
    marginTop: -12,
    marginBottom: 14,
    fontFamily: "DMSans_400Regular",
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
  dashboardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  binderSection: {
    marginTop: 24,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  binderBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
  },
  binderBtnIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  binderBtnInfo: {
    flex: 1,
    gap: 2,
  },
  binderBtnTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 16,
  },
  binderBtnSub: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
  },
  reorderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  reorderControls: {
    gap: 4,
    marginLeft: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  reorderButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
