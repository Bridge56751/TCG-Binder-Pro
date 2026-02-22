import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Platform,
  Pressable,
  Alert,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/ThemeContext";
import { useCollection } from "@/lib/CollectionContext";
import { useGallery } from "@/lib/GalleryContext";
import { apiRequest } from "@/lib/query-client";
import { cachePrices, getCachedPrices } from "@/lib/card-cache";
import type { GameId } from "@/lib/types";
import { GAMES } from "@/lib/types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const NUM_COLUMNS = 3;
const CARD_GAP = 10;
const CARD_PADDING = 16;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_PADDING * 2 - CARD_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
const CARD_HEIGHT = CARD_WIDTH / 0.72;

interface CardWithMeta {
  game: string;
  setId: string;
  cardId: string;
  quantity: number;
}

interface CardMeta {
  cardId: string;
  game: string;
  name: string;
  image: string | null;
  setName: string;
  rarity: string | null;
}

interface CardPriceInfo {
  cardId: string;
  name: string;
  price: number | null;
}

type SortOption = "recent" | "value_high" | "value_low" | "name_az" | "name_za" | "game";

const SORT_OPTIONS: { id: SortOption; label: string; icon: string }[] = [
  { id: "recent", label: "Recent", icon: "time-outline" },
  { id: "value_high", label: "Highest Value", icon: "trending-up" },
  { id: "value_low", label: "Lowest Value", icon: "trending-down" },
  { id: "name_az", label: "Name A-Z", icon: "text-outline" },
  { id: "name_za", label: "Name Z-A", icon: "text-outline" },
  { id: "game", label: "By Game", icon: "game-controller-outline" },
];

function gameLabel(game: string): string {
  return GAMES.find((g) => g.id === game)?.name || game;
}

function gameColor(game: string): string {
  return GAMES.find((g) => g.id === game)?.color || "#888";
}

function BinderCard({
  card,
  meta,
  priceInfo,
  colors,
  onPress,
  onDelete,
}: {
  card: CardWithMeta;
  meta?: CardMeta;
  priceInfo?: CardPriceInfo;
  colors: any;
  onPress: () => void;
  onDelete: () => void;
}) {
  const displayName = meta?.name || priceInfo?.name || card.cardId;
  const price = priceInfo?.price;
  const image = meta?.image;

  return (
    <Pressable
      style={[styles.binderCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
      onPress={onPress}
    >
      {image ? (
        <Image
          source={{ uri: image }}
          style={styles.binderImage}
          contentFit="cover"
          transition={200}
          cachePolicy="disk"
        />
      ) : (
        <View style={[styles.binderImage, styles.binderNoImage, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="image-outline" size={28} color={colors.textTertiary} />
        </View>
      )}
      <View style={styles.binderInfo}>
        <View style={styles.binderNameRow}>
          <Text style={[styles.binderName, { color: colors.text, flex: 1 }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Pressable
            style={styles.binderDeleteBtn}
            onPress={(e) => { e.stopPropagation?.(); onDelete(); }}
            hitSlop={6}
          >
            <Ionicons name="trash-outline" size={14} color={colors.error} />
          </Pressable>
        </View>
        <View style={styles.binderBottom}>
          <View style={[styles.binderGameDot, { backgroundColor: gameColor(card.game) }]} />
          {price != null ? (
            <Text style={[styles.binderPrice, { color: colors.tint }]}>${price.toFixed(2)}</Text>
          ) : (
            <Text style={[styles.binderPrice, { color: colors.textTertiary }]}>--</Text>
          )}
        </View>
      </View>
      {card.quantity > 1 && (
        <View style={[styles.qtyBadge, { backgroundColor: colors.tint }]}>
          <Text style={styles.qtyText}>x{card.quantity}</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function AllCardsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { collection, removeOneCard } = useCollection();
  const { setGalleryCards } = useGallery();
  const { game: initialGame } = useLocalSearchParams<{ game?: string }>();
  const validGames = GAMES.map((g) => g.id as string);
  const [filterGame, setFilterGame] = useState<GameId | "all">(
    initialGame && validGames.includes(initialGame) ? (initialGame as GameId) : "all"
  );
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

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

  const cardListForApi = useMemo(() => {
    return allCards.map((c) => ({ game: c.game, cardId: c.cardId }));
  }, [allCards]);

  const [metaMap, setMetaMap] = useState<Map<string, CardMeta>>(new Map());
  const [metaLoading, setMetaLoading] = useState(false);

  useEffect(() => {
    if (cardListForApi.length === 0) return;
    setMetaLoading(true);
    apiRequest("POST", "/api/collection/cards-meta", { cards: cardListForApi })
      .then(async (res) => {
        const data = await res.json();
        if (data.cards) {
          const map = new Map<string, CardMeta>();
          for (const c of data.cards) {
            map.set(c.cardId, c);
          }
          setMetaMap(map);
        }
      })
      .catch(() => {})
      .finally(() => setMetaLoading(false));
  }, [cardListForApi]);

  const [priceMap, setPriceMap] = useState<Map<string, CardPriceInfo>>(new Map());

  useEffect(() => {
    if (cardListForApi.length === 0) return;
    apiRequest("POST", "/api/collection/value", { cards: cardListForApi })
      .then(async (res) => {
        const data = await res.json();
        if (data.cards) {
          cachePrices(data.cards);
          const map = new Map<string, CardPriceInfo>();
          for (const c of data.cards) {
            map.set(c.cardId, c);
          }
          setPriceMap(map);
        }
      })
      .catch(async () => {
        const cached = await getCachedPrices();
        const map = new Map<string, CardPriceInfo>();
        for (const [cardId, info] of Object.entries(cached)) {
          map.set(cardId, { cardId, name: info.name, price: info.price });
        }
        setPriceMap(map);
      });
  }, [cardListForApi]);

  const sortedCards = useMemo(() => {
    const arr = [...filteredCards];
    switch (sortBy) {
      case "value_high":
        arr.sort((a, b) => {
          const pa = priceMap.get(a.cardId)?.price ?? -1;
          const pb = priceMap.get(b.cardId)?.price ?? -1;
          return pb - pa;
        });
        break;
      case "value_low":
        arr.sort((a, b) => {
          const pa = priceMap.get(a.cardId)?.price ?? Infinity;
          const pb = priceMap.get(b.cardId)?.price ?? Infinity;
          return pa - pb;
        });
        break;
      case "name_az":
        arr.sort((a, b) => {
          const na = metaMap.get(a.cardId)?.name || priceMap.get(a.cardId)?.name || a.cardId;
          const nb = metaMap.get(b.cardId)?.name || priceMap.get(b.cardId)?.name || b.cardId;
          return na.localeCompare(nb);
        });
        break;
      case "name_za":
        arr.sort((a, b) => {
          const na = metaMap.get(a.cardId)?.name || priceMap.get(a.cardId)?.name || a.cardId;
          const nb = metaMap.get(b.cardId)?.name || priceMap.get(b.cardId)?.name || b.cardId;
          return nb.localeCompare(na);
        });
        break;
      case "game":
        arr.sort((a, b) => {
          const ga = gameLabel(a.game);
          const gb = gameLabel(b.game);
          if (ga !== gb) return ga.localeCompare(gb);
          const na = metaMap.get(a.cardId)?.name || a.cardId;
          const nb = metaMap.get(b.cardId)?.name || b.cardId;
          return na.localeCompare(nb);
        });
        break;
      default:
        break;
    }
    return arr;
  }, [filteredCards, sortBy, priceMap, metaMap]);

  const totalValue = useMemo(() => {
    let total = 0;
    for (const c of filteredCards) {
      const info = priceMap.get(c.cardId);
      if (info?.price != null) total += info.price * c.quantity;
    }
    return Math.round(total * 100) / 100;
  }, [filteredCards, priceMap]);

  const handleDelete = useCallback(
    (card: CardWithMeta) => {
      const name = metaMap.get(card.cardId)?.name || priceMap.get(card.cardId)?.name || card.cardId;
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
    [removeOneCard, metaMap, priceMap]
  );

  const handleCardPress = useCallback((card: CardWithMeta) => {
    const galleryList = sortedCards
      .map((c) => {
        const m = metaMap.get(c.cardId);
        return m && m.image ? {
          id: c.cardId,
          name: m.name,
          image: m.image,
          setName: m.setName,
        } : null;
      })
      .filter(Boolean) as { id: string; name: string; image: string; setName?: string }[];
    setGalleryCards(galleryList);
    router.push({
      pathname: "/card/[game]/[cardId]",
      params: { game: card.game, cardId: card.cardId },
    });
  }, [sortedCards, metaMap, setGalleryCards]);

  const currentSort = SORT_OPTIONS.find((s) => s.id === sortBy)!;

  const renderGridItem = useCallback(({ item }: { item: CardWithMeta }) => (
    <BinderCard
      card={item}
      meta={metaMap.get(item.cardId)}
      priceInfo={priceMap.get(item.cardId)}
      colors={colors}
      onPress={() => handleCardPress(item)}
      onDelete={() => handleDelete(item)}
    />
  ), [metaMap, priceMap, colors, handleCardPress, handleDelete]);

  const renderListItem = useCallback(({ item }: { item: CardWithMeta }) => {
    const meta = metaMap.get(item.cardId);
    const priceInfo = priceMap.get(item.cardId);
    const displayName = meta?.name || priceInfo?.name || item.cardId;
    const price = priceInfo?.price;

    return (
      <Pressable
        style={[styles.listRow, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
        onPress={() => handleCardPress(item)}
      >
        {meta?.image ? (
          <Image
            source={{ uri: meta.image }}
            style={styles.listThumb}
            contentFit="cover"
            transition={200}
            cachePolicy="disk"
          />
        ) : (
          <View style={[styles.listThumb, { backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="image-outline" size={18} color={colors.textTertiary} />
          </View>
        )}
        <View style={styles.listInfo}>
          <Text style={[styles.listName, { color: colors.text }]} numberOfLines={1}>{displayName}</Text>
          <Text style={[styles.listMeta, { color: colors.textTertiary }]} numberOfLines={1}>
            {gameLabel(item.game)} · {meta?.setName || item.setId}
            {item.quantity > 1 ? ` · x${item.quantity}` : ""}
          </Text>
        </View>
        {price != null ? (
          <Text style={[styles.listPrice, { color: colors.tint }]}>${price.toFixed(2)}</Text>
        ) : (
          <Text style={[styles.listPrice, { color: colors.textTertiary }]}>--</Text>
        )}
        <Pressable
          style={styles.listDeleteBtn}
          onPress={(e) => { e.stopPropagation?.(); handleDelete(item); }}
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={18} color={colors.error} />
        </Pressable>
      </Pressable>
    );
  }, [metaMap, priceMap, colors, handleCardPress, handleDelete]);

  const keyExtractor = useCallback((item: CardWithMeta) => `${item.game}:${item.setId}:${item.cardId}`, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.headerTitles}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>My Binder</Text>
            <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
              {filteredCards.length} cards · ${totalValue.toFixed(2)} value
            </Text>
          </View>
          <Pressable
            style={[styles.viewToggle, { backgroundColor: colors.surfaceAlt }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setViewMode(v => v === "grid" ? "list" : "grid");
            }}
          >
            <Ionicons name={viewMode === "grid" ? "list" : "grid"} size={20} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.controlsRow}>
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

        <Pressable
          style={[styles.sortBtn, { backgroundColor: colors.surfaceAlt }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowSortMenu(!showSortMenu);
          }}
        >
          <Ionicons name={currentSort.icon as any} size={16} color={colors.tint} />
          <Text style={[styles.sortBtnText, { color: colors.text }]}>{currentSort.label}</Text>
          <Ionicons name={showSortMenu ? "chevron-up" : "chevron-down"} size={14} color={colors.textTertiary} />
        </Pressable>

        {showSortMenu && (
          <View style={[styles.sortMenu, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            {SORT_OPTIONS.map((opt) => {
              const active = sortBy === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[styles.sortMenuItem, active && { backgroundColor: colors.tint + "12" }]}
                  onPress={() => {
                    setSortBy(opt.id);
                    setShowSortMenu(false);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Ionicons name={opt.icon as any} size={18} color={active ? colors.tint : colors.textSecondary} />
                  <Text style={[styles.sortMenuText, { color: active ? colors.tint : colors.text }]}>
                    {opt.label}
                  </Text>
                  {active && <Ionicons name="checkmark" size={18} color={colors.tint} />}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {metaLoading && sortedCards.length === 0 ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading your binder...</Text>
        </View>
      ) : sortedCards.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="albums-outline" size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Binder is Empty</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Add cards from sets or scan them to fill your binder
          </Text>
          <Pressable
            style={[styles.emptyBtn, { backgroundColor: colors.tint }]}
            onPress={() => router.push("/(tabs)/sets")}
          >
            <Ionicons name="search" size={18} color="#FFF" />
            <Text style={styles.emptyBtnText}>Browse Sets</Text>
          </Pressable>
        </View>
      ) : viewMode === "grid" ? (
        <FlatList
          key="grid"
          data={sortedCards}
          keyExtractor={keyExtractor}
          numColumns={NUM_COLUMNS}
          contentContainerStyle={{ paddingHorizontal: CARD_PADDING, paddingBottom: bottomInset + 20 }}
          columnWrapperStyle={{ gap: CARD_GAP, marginBottom: CARD_GAP }}
          showsVerticalScrollIndicator={false}
          renderItem={renderGridItem}
          scrollEnabled={!!sortedCards.length}
        />
      ) : (
        <FlatList
          key="list"
          data={sortedCards}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomInset + 20 }}
          showsVerticalScrollIndicator={false}
          renderItem={renderListItem}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          scrollEnabled={!!sortedCards.length}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitles: { flex: 1 },
  headerTitle: { fontFamily: "DMSans_700Bold", fontSize: 24 },
  headerSub: { fontFamily: "DMSans_400Regular", fontSize: 13, marginTop: 2 },
  viewToggle: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  controlsRow: { gap: 8 },
  filterRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  filterChipText: { fontFamily: "DMSans_600SemiBold", fontSize: 13 },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  sortBtnText: { fontFamily: "DMSans_500Medium", fontSize: 13 },
  sortMenu: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  sortMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sortMenuText: { fontFamily: "DMSans_500Medium", fontSize: 14, flex: 1 },
  binderCard: {
    width: CARD_WIDTH,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  binderImage: {
    width: "100%",
    height: CARD_HEIGHT,
    borderTopLeftRadius: 11,
    borderTopRightRadius: 11,
  },
  binderNoImage: {
    alignItems: "center",
    justifyContent: "center",
  },
  binderInfo: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
  },
  binderNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  binderName: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 11,
  },
  binderDeleteBtn: {
    padding: 2,
  },
  binderBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  binderGameDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  binderPrice: {
    fontFamily: "DMSans_700Bold",
    fontSize: 11,
  },
  qtyBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  qtyText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 10,
    color: "#FFF",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  listThumb: {
    width: 48,
    height: 66,
    borderRadius: 8,
  },
  listDeleteBtn: {
    padding: 8,
  },
  listInfo: { flex: 1, gap: 2 },
  listName: { fontFamily: "DMSans_600SemiBold", fontSize: 15 },
  listMeta: { fontFamily: "DMSans_400Regular", fontSize: 12 },
  listPrice: { fontFamily: "DMSans_700Bold", fontSize: 15 },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyTitle: { fontFamily: "DMSans_700Bold", fontSize: 18 },
  emptyText: { fontFamily: "DMSans_400Regular", fontSize: 14, textAlign: "center" },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  emptyBtnText: { fontFamily: "DMSans_600SemiBold", fontSize: 15, color: "#FFF" },
});
