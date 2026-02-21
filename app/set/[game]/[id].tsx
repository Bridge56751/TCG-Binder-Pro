import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Platform,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  RefreshControl,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { CardCell } from "@/components/CardCell";
import { useCollection } from "@/lib/CollectionContext";
import { useTheme } from "@/lib/ThemeContext";
import { useGallery } from "@/lib/GalleryContext";
import { getApiUrl, queryClient } from "@/lib/query-client";
import { cacheCards, getCachedSetCards, getCachedSets, type CachedCard } from "@/lib/card-cache";
import type { GameId, SetDetail, TCGCard } from "@/lib/types";
import { GAMES } from "@/lib/types";

const NUM_COLUMNS = 3;

type FilterMode = "all" | "collected" | "missing";
type SortMode = "number" | "name" | "value";

export default function SetDetailScreen() {
  const insets = useSafeAreaInsets();
  const { game, id, lang } = useLocalSearchParams<{ game: string; id: string; lang?: string }>();
  const gameId = game as GameId;
  const { collection, hasCard, setCards, removeCard, removeOneCard, addCard, cardQuantity } = useCollection();
  const { colors } = useTheme();
  const { setGalleryCards } = useGallery();

  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [sortMode, setSortMode] = useState<SortMode>("number");
  const [quickAddVisible, setQuickAddVisible] = useState(false);
  const [quickAddSearch, setQuickAddSearch] = useState("");
  const [cardPrices, setCardPrices] = useState<Record<string, number | null>>({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [trashMode, setTrashMode] = useState(false);
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [offlineData, setOfflineData] = useState<SetDetail | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const pricesFetched = React.useRef(false);
  const isAddingRef = useRef(false);
  const flatListRef = useRef<FlatList>(null);
  const scrollOffsetRef = useRef(0);

  const queryPath = `/api/tcg/${game}/sets/${id}/cards`;

  const { data: setDetail, isLoading, isError } = useQuery<SetDetail>({
    queryKey: [queryPath],
  });

  useFocusEffect(
    useCallback(() => {
      if (scrollOffsetRef.current > 0) {
        requestAnimationFrame(() => {
          flatListRef.current?.scrollToOffset({ offset: scrollOffsetRef.current, animated: false });
        });
      }
    }, [])
  );

  useEffect(() => {
    if (setDetail?.cards && game) {
      setIsOffline(false);
      const gId = game as GameId;
      const cardsToCache: CachedCard[] = setDetail.cards.map(c => ({
        id: c.id,
        localId: c.localId,
        name: c.name,
        englishName: c.englishName,
        image: c.image,
        game: gId,
        setId: String(id),
        setName: setDetail.name,
        rarity: c.rarity,
        cachedAt: Date.now(),
      }));
      cacheCards(cardsToCache);
    }
  }, [setDetail, game, id]);

  useEffect(() => {
    if (isError && !setDetail && game && id) {
      (async () => {
        const cachedCards = await getCachedSetCards(game as GameId, String(id));
        if (cachedCards.length > 0) {
          const cachedSetsData = await getCachedSets(game);
          const setInfo = cachedSetsData?.find(s => s.id === id);
          const cards: TCGCard[] = cachedCards.map(c => ({
            id: c.id,
            localId: c.localId,
            name: c.name,
            englishName: c.englishName,
            image: c.image,
            rarity: c.rarity || null,
            number: c.localId,
          }));
          setOfflineData({
            id: String(id),
            name: setInfo?.name || "Offline Set",
            game: game,
            totalCards: setInfo?.totalCards || cards.length,
            cards,
          });
          setIsOffline(true);
        }
      })();
    }
  }, [isError, setDetail, game, id]);

  const toggleTrashMode = useCallback(() => {
    if (trashMode) {
      setTrashMode(false);
      setSelectedCards(new Set());
    } else {
      setTrashMode(true);
      setSelectedCards(new Set());
    }
  }, [trashMode]);

  const toggleCardSelection = useCallback((cardId: string) => {
    setSelectedCards(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleDeleteSelected = useCallback(() => {
    const count = selectedCards.size;
    if (count === 0) return;
    Alert.alert(
      "Remove Cards",
      `Remove ${count} card${count > 1 ? "s" : ""} from your collection? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            for (const cardId of selectedCards) {
              await removeCard(gameId, id || "", cardId);
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setSelectedCards(new Set());
            setTrashMode(false);
          },
        },
      ]
    );
  }, [selectedCards, removeCard, gameId, id]);

  const handleQuickAdd = useCallback(
    async (cardId: string) => {
      if (isAddingRef.current) return;
      isAddingRef.current = true;
      try {
        await addCard(gameId, id || "", cardId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err: any) {
        if (err?.message === "FREE_LIMIT" || err?.message === "GUEST_LIMIT") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          router.push("/upgrade");
        }
      } finally {
        setTimeout(() => {
          isAddingRef.current = false;
        }, 300);
      }
    },
    [addCard, gameId, id]
  );

  const handleQuickRemove = useCallback(
    async (cardId: string, cardName: string) => {
      Alert.alert(
        "Remove Card",
        `Remove one copy of "${cardName}"?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              await removeOneCard(gameId, id || "", cardId);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            },
          },
        ]
      );
    },
    [removeOneCard, gameId, id]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const startTime = Date.now();
    
    await queryClient.invalidateQueries({ queryKey: [queryPath] });
    pricesFetched.current = false;
    
    const elapsed = Date.now() - startTime;
    const remainingDelay = Math.max(1000 - elapsed, 0);
    
    if (remainingDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingDelay));
    }
    
    setRefreshing(false);
  }, [queryPath]);

  const activeData = setDetail || offlineData;

  const quickAddFilteredCards = useMemo(() => {
    const allCards = activeData?.cards || [];
    if (!quickAddSearch.trim()) return allCards;
    const q = quickAddSearch.toLowerCase();
    return allCards.filter(
      (c) =>
        (c.englishName || c.name).toLowerCase().includes(q) ||
        c.localId.toLowerCase().includes(q)
    );
  }, [activeData?.cards, quickAddSearch]);

  const fetchPrices = useCallback(async () => {
    if (pricesFetched.current || pricesLoading) return;
    setPricesLoading(true);
    try {
      const url = new URL(`/api/tcg/${game}/sets/${id}/prices`, getApiUrl());
      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setCardPrices(data.prices || {});
        pricesFetched.current = true;
      }
    } catch {}
    setPricesLoading(false);
  }, [game, id, pricesLoading]);

  useEffect(() => {
    if (sortMode === "value" && !pricesFetched.current) {
      fetchPrices();
    }
  }, [sortMode, fetchPrices]);

  const gameInfo = GAMES.find((g) => g.id === gameId);
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const collectedCount = setCards(gameId, id || "");
  const totalCards = activeData?.totalCards || 0;
  const progress = totalCards > 0 ? collectedCount / totalCards : 0;

  const setCollectionMap = useMemo(() => {
    const map: Record<string, number> = {};
    const gameData = collection[gameId];
    if (gameData) {
      const setData = gameData[id || ""];
      if (Array.isArray(setData)) {
        for (const cardId of setData) {
          map[cardId] = (map[cardId] || 0) + 1;
        }
      }
    }
    return map;
  }, [collection, gameId, id]);

  const filteredAndSortedCards = useMemo(() => {
    const allCards = activeData?.cards || [];

    let filtered: TCGCard[];
    switch (filterMode) {
      case "collected":
        filtered = allCards.filter((card) => (setCollectionMap[card.id] || 0) > 0);
        break;
      case "missing":
        filtered = allCards.filter((card) => !(setCollectionMap[card.id] || 0));
        break;
      default:
        filtered = [...allCards];
    }

    if (sortMode === "name") {
      filtered.sort((a, b) => (a.englishName || a.name).localeCompare(b.englishName || b.name));
    } else if (sortMode === "value") {
      filtered.sort((a, b) => {
        const priceA = cardPrices[a.id] ?? (a as any).price ?? -1;
        const priceB = cardPrices[b.id] ?? (b as any).price ?? -1;
        return priceB - priceA;
      });
    } else {
      filtered.sort((a, b) => {
        const numA = parseInt(a.localId, 10);
        const numB = parseInt(b.localId, 10);
        if (isNaN(numA) && isNaN(numB)) return a.localId.localeCompare(b.localId);
        if (isNaN(numA)) return 1;
        if (isNaN(numB)) return -1;
        return numA - numB;
      });
    }

    return filtered;
  }, [activeData?.cards, filterMode, sortMode, setCollectionMap, cardPrices]);

  const dynamicStyles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        loadingText: {
          fontFamily: "DMSans_400Regular",
          fontSize: 14,
          color: colors.textSecondary,
        },
        setName: {
          fontFamily: "DMSans_700Bold",
          fontSize: 22,
          color: colors.text,
        },
        setMeta: {
          fontFamily: "DMSans_400Regular",
          fontSize: 13,
          color: colors.textSecondary,
        },
        scanButton: {
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: colors.tint,
          alignItems: "center",
          justifyContent: "center",
        },
        progressSection: {
          marginHorizontal: 20,
          backgroundColor: colors.surface,
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          gap: 8,
          borderWidth: 1,
          borderColor: colors.cardBorder,
        },
        progressLabel: {
          fontFamily: "DMSans_500Medium",
          fontSize: 14,
          color: colors.textSecondary,
        },
        progressValue: {
          fontFamily: "DMSans_700Bold",
          fontSize: 16,
          color: colors.text,
        },
        progressBarBg: {
          height: 8,
          borderRadius: 4,
          backgroundColor: colors.surfaceAlt,
          overflow: "hidden" as const,
        },
        progressPercent: {
          fontFamily: "DMSans_400Regular",
          fontSize: 12,
          color: colors.textTertiary,
          textAlign: "right" as const,
        },
        binderTitle: {
          fontFamily: "DMSans_600SemiBold",
          fontSize: 16,
          color: colors.text,
        },
        binderSubtitle: {
          fontFamily: "DMSans_400Regular",
          fontSize: 12,
          color: colors.textTertiary,
          marginTop: 2,
        },
        filterChip: {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: 5,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 20,
          backgroundColor: colors.surfaceAlt,
        },
        filterChipActive: {
          backgroundColor: colors.tint,
        },
        filterChipText: {
          fontFamily: "DMSans_600SemiBold",
          fontSize: 13,
          color: colors.textSecondary,
        },
        filterChipTextActive: {
          color: "#FFFFFF",
        },
        sortButton: {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: 5,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 20,
          backgroundColor: colors.surfaceAlt,
        },
        sortButtonText: {
          fontFamily: "DMSans_500Medium",
          fontSize: 12,
          color: colors.textSecondary,
        },
        filterCountText: {
          fontFamily: "DMSans_400Regular",
          fontSize: 12,
          color: colors.textTertiary,
          paddingHorizontal: 20,
          marginTop: 4,
        },
      }),
    [colors]
  );

  const filterOptions: { key: FilterMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: "all", label: "All", icon: "grid-outline" },
    { key: "collected", label: "Collected", icon: "checkmark-circle-outline" },
    { key: "missing", label: "Missing", icon: "close-circle-outline" },
  ];

  const renderHeader = () => (
    <View style={styles.headerSection}>
      <View style={[styles.topBar, { paddingTop: topInset + 8 }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={dynamicStyles.setName} numberOfLines={1}>
            {activeData?.name || id}
          </Text>
          <Text style={dynamicStyles.setMeta}>
            {id} · {gameInfo?.name}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: colors.tint + "15" }]}
            onPress={() => { setQuickAddSearch(""); setQuickAddVisible(true); }}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.tint} />
          </Pressable>
          {collectedCount > 0 && (
            <Pressable
              style={[styles.actionBtn, { backgroundColor: trashMode ? colors.error : colors.error + "15" }]}
              onPress={toggleTrashMode}
            >
              <Ionicons name="trash-outline" size={18} color={trashMode ? "#FFFFFF" : colors.error} />
            </Pressable>
          )}
          <Pressable
            style={dynamicStyles.scanButton}
            onPress={() => router.push("/(tabs)/scan")}
          >
            <Ionicons name="scan" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {isOffline && (
        <View style={{ backgroundColor: "#F59E0B", paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, marginHorizontal: 16, marginBottom: 8, alignItems: "center" }}>
          <Text style={{ fontFamily: "DMSans_600SemiBold", fontSize: 12, color: "#FFFFFF" }}>Offline Mode - Showing cached data</Text>
        </View>
      )}

      <View style={dynamicStyles.progressSection}>
        <View style={styles.progressInfo}>
          <Text style={dynamicStyles.progressLabel}>
            {collectedCount}/{totalCards} collected
          </Text>
          <Text style={dynamicStyles.progressPercent}>
            {Math.round(progress * 100)}%
          </Text>
        </View>
        <View style={dynamicStyles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${Math.min(progress * 100, 100)}%`,
                backgroundColor:
                  progress >= 1 ? colors.success : gameInfo?.color || colors.tint,
              },
            ]}
          />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
        {filterOptions.map((opt) => {
          const isActive = filterMode === opt.key;
          return (
            <Pressable
              key={opt.key}
              style={[dynamicStyles.filterChip, isActive && dynamicStyles.filterChipActive]}
              onPress={() => setFilterMode(opt.key)}
            >
              <Ionicons
                name={opt.icon}
                size={14}
                color={isActive ? "#FFFFFF" : colors.textSecondary}
              />
              <Text style={[dynamicStyles.filterChipText, isActive && dynamicStyles.filterChipTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          style={dynamicStyles.sortButton}
          onPress={() => setSortMode((prev) => {
            if (prev === "number") return "name";
            if (prev === "name") return "value";
            return "number";
          })}
        >
          <Ionicons
            name={sortMode === "value" ? "trending-down" : "swap-vertical"}
            size={14}
            color={sortMode === "value" ? colors.tint : colors.textSecondary}
          />
          {sortMode === "value" && pricesLoading ? (
            <ActivityIndicator size={10} color={colors.tint} />
          ) : (
            <Text style={[
              dynamicStyles.sortButtonText,
              sortMode === "value" && { color: colors.tint },
            ]}>
              {sortMode === "number" ? "#" : sortMode === "name" ? "A-Z" : "$"}
            </Text>
          )}
        </Pressable>
      </ScrollView>

      {filterMode !== "all" && (
        <Text style={dynamicStyles.filterCountText}>
          Showing {filteredAndSortedCards.length} of {totalCards} cards
        </Text>
      )}
    </View>
  );

  if (isLoading && !activeData) {
    return (
      <View style={[dynamicStyles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.tint} />
        <Text style={dynamicStyles.loadingText}>Loading set...</Text>
      </View>
    );
  }

  return (
    <View style={dynamicStyles.container}>
      <FlatList
        ref={flatListRef}
        data={filteredAndSortedCards}
        keyExtractor={(item) => item.id}
        numColumns={NUM_COLUMNS}
        ListHeaderComponent={renderHeader}
        onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.tint} colors={[colors.tint]} />}
        renderItem={({ item }) => {
          const qty = setCollectionMap[item.id] || 0;
          const collected = qty > 0;
          const itemPrice = sortMode === "value" ? (cardPrices[item.id] ?? (item as any).price ?? null) : undefined;
          const isSelected = selectedCards.has(item.id);
          return (
            <View style={styles.cellWrapper}>
              <CardCell
                cardId={item.id}
                localId={item.localId}
                name={item.englishName || item.name}
                imageUrl={item.image}
                isCollected={collected}
                quantity={qty}
                price={itemPrice}
                selected={isSelected}
                onPress={() => {
                  if (trashMode && collected) {
                    toggleCardSelection(item.id);
                    return;
                  }
                  const galleryList = filteredAndSortedCards.map((c) => ({
                    id: c.id,
                    name: c.englishName || c.name,
                    image: c.image,
                    localId: c.localId,
                    setName: activeData?.name,
                  }));
                  setGalleryCards(galleryList);
                  router.push(`/card/${game}/${item.id}`);
                }}
                onLongPress={collected && !trashMode ? () => {
                  Alert.alert(
                    "Remove Card",
                    `Remove one copy of "${item.englishName || item.name}"? (${qty} in collection)`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Remove One",
                        style: "destructive",
                        onPress: () => {
                          removeOneCard(gameId, id || "", item.id);
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        },
                      },
                      ...(qty > 1 ? [{
                        text: "Remove All",
                        style: "destructive" as const,
                        onPress: () => {
                          removeCard(gameId, id || "", item.id);
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        },
                      }] : []),
                    ]
                  );
                } : undefined}
              />
            </View>
          );
        }}
        columnWrapperStyle={styles.row}
        contentContainerStyle={[
          styles.gridContent,
          { paddingBottom: bottomInset + (trashMode ? 90 : 20) },
        ]}
        showsVerticalScrollIndicator={false}
      />

      <Modal
        visible={quickAddVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setQuickAddVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Quick Add</Text>
            <Pressable onPress={() => setQuickAddVisible(false)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          <View style={[styles.searchBar, { backgroundColor: colors.surfaceAlt, borderColor: colors.cardBorder }]}>
            <Ionicons name="search" size={18} color={colors.textTertiary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search by name or number..."
              placeholderTextColor={colors.textTertiary}
              value={quickAddSearch}
              onChangeText={setQuickAddSearch}
              autoFocus
            />
            {quickAddSearch.length > 0 && (
              <Pressable onPress={() => setQuickAddSearch("")}>
                <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
              </Pressable>
            )}
          </View>
          <FlatList
            data={quickAddFilteredCards}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
            renderItem={({ item }) => {
              const qty = setCollectionMap[item.id] || 0;
              return (
                <View style={[styles.quickAddRow, { borderBottomColor: colors.cardBorder }]}>
                  <View style={styles.quickAddInfo}>
                    <Text style={[styles.quickAddNumber, { color: colors.textTertiary }]}>
                      #{item.localId}
                    </Text>
                    <Text style={[styles.quickAddName, { color: colors.text }]} numberOfLines={1}>
                      {item.englishName || item.name}
                    </Text>
                    {qty > 0 && (
                      <View style={[styles.qtyBadge, { backgroundColor: colors.tint + "20" }]}>
                        <Text style={[styles.qtyBadgeText, { color: colors.tint }]}>x{qty}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.quickAddActions}>
                    {qty > 0 && (
                      <Pressable
                        style={[styles.quickAddBtn, { backgroundColor: colors.error + "15" }]}
                        onPress={() => handleQuickRemove(item.id, item.englishName || item.name)}
                      >
                        <Ionicons name="remove" size={20} color={colors.error} />
                      </Pressable>
                    )}
                    <Pressable
                      style={[styles.quickAddBtn, { backgroundColor: colors.tint + "15" }]}
                      onPress={() => handleQuickAdd(item.id)}
                    >
                      <Ionicons name="add" size={20} color={colors.tint} />
                    </Pressable>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.quickAddEmpty}>
                <Text style={[styles.quickAddEmptyText, { color: colors.textTertiary }]}>
                  No cards found
                </Text>
              </View>
            }
          />
        </View>
      </Modal>

      {trashMode && (
        <View style={[styles.trashBar, { backgroundColor: colors.surface, borderTopColor: colors.cardBorder, paddingBottom: bottomInset + 12 }]}>
          <Pressable style={styles.trashBarCancel} onPress={toggleTrashMode}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
          <Text style={[styles.trashBarText, { color: colors.text }]}>
            {selectedCards.size > 0
              ? `${selectedCards.size} card${selectedCards.size > 1 ? "s" : ""} selected`
              : "Tap cards to select"}
          </Text>
          <Pressable
            style={[styles.trashBarDelete, { backgroundColor: selectedCards.size > 0 ? colors.error : colors.error + "40" }]}
            onPress={handleDeleteSelected}
            disabled={selectedCards.size === 0}
          >
            <Ionicons name="trash" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  headerSection: {
    paddingBottom: 12,
    gap: 12,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 4,
    gap: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerInfo: {
    flex: 1,
    gap: 2,
  },
  progressInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  binderHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  binderActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
  },
  gridContent: {
    paddingHorizontal: 16,
  },
  row: {
    gap: 10,
    marginBottom: 12,
  },
  cellWrapper: {
    flex: 1,
    maxWidth: "33.33%",
  },
  modalContainer: {
    flex: 1,
    paddingTop: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  modalTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 22,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    padding: 0,
  },
  quickAddRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  quickAddInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quickAddNumber: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    minWidth: 36,
  },
  quickAddName: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    flex: 1,
  },
  qtyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  qtyBadgeText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 12,
  },
  quickAddActions: {
    flexDirection: "row",
    gap: 8,
  },
  quickAddBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  quickAddEmpty: {
    paddingVertical: 40,
    alignItems: "center",
  },
  quickAddEmptyText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
  },
  trashBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  trashBarCancel: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  trashBarText: {
    flex: 1,
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    textAlign: "center",
  },
  trashBarDelete: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
