import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Platform,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { CardCell } from "@/components/CardCell";
import { useCollection } from "@/lib/CollectionContext";
import { useTheme } from "@/lib/ThemeContext";
import type { GameId, SetDetail, TCGCard } from "@/lib/types";
import { GAMES } from "@/lib/types";

const NUM_COLUMNS = 3;

type FilterMode = "all" | "collected" | "missing";
type SortMode = "number" | "name";

export default function SetDetailScreen() {
  const insets = useSafeAreaInsets();
  const { game, id, lang } = useLocalSearchParams<{ game: string; id: string; lang?: string }>();
  const gameId = game as GameId;
  const { hasCard, setCards, removeCard, cardQuantity } = useCollection();
  const { colors } = useTheme();

  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [sortMode, setSortMode] = useState<SortMode>("number");

  const langParam = lang === "ja" ? "ja" : "en";
  const queryPath = gameId === "pokemon" && langParam === "ja"
    ? `/api/tcg/${game}/sets/${id}/cards?lang=ja`
    : `/api/tcg/${game}/sets/${id}/cards`;

  const { data: setDetail, isLoading } = useQuery<SetDetail>({
    queryKey: [queryPath],
  });

  const gameInfo = GAMES.find((g) => g.id === gameId);
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const collectedCount = setCards(gameId, id || "");
  const totalCards = setDetail?.totalCards || 0;
  const progress = totalCards > 0 ? collectedCount / totalCards : 0;

  const filteredAndSortedCards = useMemo(() => {
    const allCards = setDetail?.cards || [];

    let filtered: TCGCard[];
    switch (filterMode) {
      case "collected":
        filtered = allCards.filter((card) => hasCard(gameId, id || "", card.id));
        break;
      case "missing":
        filtered = allCards.filter((card) => !hasCard(gameId, id || "", card.id));
        break;
      default:
        filtered = [...allCards];
    }

    if (sortMode === "name") {
      filtered.sort((a, b) => (a.englishName || a.name).localeCompare(b.englishName || b.name));
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
  }, [setDetail?.cards, filterMode, sortMode, gameId, id, hasCard]);

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
          borderRadius: 14,
          padding: 16,
          gap: 10,
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
            {setDetail?.name || id}
          </Text>
          <Text style={dynamicStyles.setMeta}>
            {id} - {gameInfo?.name}
          </Text>
        </View>
        <Pressable
          style={dynamicStyles.scanButton}
          onPress={() => router.push("/(tabs)/scan")}
        >
          <Ionicons name="scan" size={18} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={dynamicStyles.progressSection}>
        <View style={styles.progressInfo}>
          <Text style={dynamicStyles.progressLabel}>Collection Progress</Text>
          <Text style={dynamicStyles.progressValue}>
            {collectedCount}/{totalCards}
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
        <Text style={dynamicStyles.progressPercent}>
          {Math.round(progress * 100)}% Complete
        </Text>
      </View>

      <View style={styles.binderHeader}>
        <View>
          <Text style={dynamicStyles.binderTitle}>Binder View</Text>
          <Text style={dynamicStyles.binderSubtitle}>Scan cards to fill in your collection</Text>
        </View>
      </View>

      <View style={styles.filterBar}>
        <View style={styles.filterChips}>
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
        </View>
        <Pressable
          style={dynamicStyles.sortButton}
          onPress={() => setSortMode((prev) => (prev === "number" ? "name" : "number"))}
        >
          <Ionicons name="swap-vertical" size={14} color={colors.textSecondary} />
          <Text style={dynamicStyles.sortButtonText}>
            {sortMode === "number" ? "#" : "A-Z"}
          </Text>
        </Pressable>
      </View>

      {filterMode !== "all" && (
        <Text style={dynamicStyles.filterCountText}>
          Showing {filteredAndSortedCards.length} of {totalCards} cards
        </Text>
      )}
    </View>
  );

  if (isLoading) {
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
        data={filteredAndSortedCards}
        keyExtractor={(item) => item.id}
        numColumns={NUM_COLUMNS}
        ListHeaderComponent={renderHeader}
        renderItem={({ item }) => {
          const collected = hasCard(gameId, id || "", item.id);
          const qty = collected ? cardQuantity(gameId, id || "", item.id) : 0;
          return (
            <View style={styles.cellWrapper}>
              <CardCell
                cardId={item.id}
                localId={item.localId}
                name={item.englishName || item.name}
                imageUrl={item.image}
                isCollected={collected}
                quantity={qty}
                onPress={() => {
                  const cardRoute = langParam === "ja"
                    ? `/card/${game}/${item.id}?lang=ja`
                    : `/card/${game}/${item.id}`;
                  router.push(cardRoute);
                }}
                onLongPress={collected ? () => {
                  Alert.alert(
                    "Remove Card",
                    `Remove ${item.name} from your collection?`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Remove",
                        style: "destructive",
                        onPress: () => removeCard(gameId, id || "", item.id),
                      },
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
          { paddingBottom: bottomInset + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      />
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
    paddingBottom: 16,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 16,
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
    marginTop: 16,
  },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 12,
  },
  filterChips: {
    flexDirection: "row",
    gap: 8,
    flex: 1,
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
});
