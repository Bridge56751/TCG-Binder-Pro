import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Platform,
  ActivityIndicator,
  TextInput,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { GameSelector } from "@/components/GameSelector";
import { SetCard } from "@/components/SetCard";
import { useCollection } from "@/lib/CollectionContext";
import { useTheme } from "@/lib/ThemeContext";
import { apiRequest } from "@/lib/query-client";
import { getCachedSets, cacheSets, type CachedSet } from "@/lib/card-cache";
import type { GameId, TCGSet } from "@/lib/types";

type SearchMode = "sets" | "cards";
type SetSortOption = "default" | "oldest" | "name_az" | "name_za" | "most_completed" | "least_completed" | "most_cards" | "least_cards";

const SET_SORT_OPTIONS: { id: SetSortOption; label: string; icon: string }[] = [
  { id: "default", label: "Newest", icon: "calendar-outline" },
  { id: "oldest", label: "Oldest", icon: "calendar-outline" },
  { id: "most_completed", label: "Most Completed", icon: "checkmark-circle-outline" },
  { id: "least_completed", label: "Least Completed", icon: "ellipse-outline" },
  { id: "name_az", label: "Name A-Z", icon: "text-outline" },
  { id: "name_za", label: "Name Z-A", icon: "text-outline" },
  { id: "most_cards", label: "Most Cards", icon: "layers-outline" },
  { id: "least_cards", label: "Least Cards", icon: "remove-circle-outline" },
];

interface CardSearchResult {
  id: string;
  name: string;
  game: string;
  setName: string;
  image: string | null;
  price: number | null;
}

export default function SetsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [selectedGame, setSelectedGame] = useState<GameId>("pokemon");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("sets");
  const [cardResults, setCardResults] = useState<CardSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sortBy, setSortBy] = useState<SetSortOption>("default");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const { setCards, collection, enabledGames } = useCollection();

  useEffect(() => {
    if (!enabledGames.includes(selectedGame) && enabledGames.length > 0) {
      setSelectedGame(enabledGames[0]);
    }
  }, [enabledGames, selectedGame]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setsQueryPath = `/api/tcg/${selectedGame}/sets`;

  const { data: sets, isLoading, isError } = useQuery<TCGSet[]>({
    queryKey: [setsQueryPath],
    staleTime: 5 * 60 * 1000,
  });

  const [offlineSets, setOfflineSets] = useState<TCGSet[] | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (sets && sets.length > 0) {
      setIsOffline(false);
      setOfflineSets(null);
      cacheSets(selectedGame, sets.map(s => ({
        id: s.id,
        name: s.name,
        game: selectedGame,
        totalCards: s.totalCards,
        logo: s.logo,
        releaseDate: s.releaseDate,
        cachedAt: Date.now(),
      })));
    }
  }, [sets, selectedGame]);

  useEffect(() => {
    if (isError && !sets) {
      (async () => {
        const cached = await getCachedSets(selectedGame);
        if (cached && cached.length > 0) {
          const asSets: TCGSet[] = cached.map(c => ({
            id: c.id,
            name: c.name,
            game: c.game,
            totalCards: c.totalCards,
            logo: c.logo || undefined,
            releaseDate: c.releaseDate,
          }));
          setOfflineSets(asSets);
          setIsOffline(true);
        }
      })();
    } else if (sets) {
      setIsOffline(false);
    }
  }, [isError, sets, selectedGame]);

  const activeSets = sets || offlineSets;

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const filteredSets = useMemo(() => {
    const filtered = activeSets?.filter(
      (s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.id.toLowerCase().includes(searchQuery.toLowerCase()),
    ) || [];

    if (sortBy === "default") return filtered;

    const sorted = [...filtered];
    switch (sortBy) {
      case "oldest":
        sorted.sort((a, b) => (a.releaseDate || "").localeCompare(b.releaseDate || ""));
        break;
      case "name_az":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name_za":
        sorted.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "most_completed": {
        sorted.sort((a, b) => {
          const aCollected = collection[selectedGame]?.[a.id]?.length || 0;
          const bCollected = collection[selectedGame]?.[b.id]?.length || 0;
          const aPct = a.totalCards > 0 ? aCollected / a.totalCards : 0;
          const bPct = b.totalCards > 0 ? bCollected / b.totalCards : 0;
          return bPct - aPct;
        });
        break;
      }
      case "least_completed": {
        sorted.sort((a, b) => {
          const aCollected = collection[selectedGame]?.[a.id]?.length || 0;
          const bCollected = collection[selectedGame]?.[b.id]?.length || 0;
          const aPct = a.totalCards > 0 ? aCollected / a.totalCards : 0;
          const bPct = b.totalCards > 0 ? bCollected / b.totalCards : 0;
          return aPct - bPct;
        });
        break;
      }
      case "most_cards":
        sorted.sort((a, b) => b.totalCards - a.totalCards);
        break;
      case "least_cards":
        sorted.sort((a, b) => a.totalCards - b.totalCards);
        break;
    }
    return sorted;
  }, [activeSets, searchQuery, sortBy, collection, selectedGame]);

  const searchCards = useCallback(
    async (query: string, game: GameId) => {
      if (query.length < 2) {
        setCardResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      try {
        const res = await apiRequest(
          "GET",
          `/api/search?q=${encodeURIComponent(query)}&game=${game}`,
        );
        const data: CardSearchResult[] = await res.json();
        setCardResults(data);
      } catch {
        setCardResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (searchMode !== "cards" || searchQuery.length < 2) {
      setCardResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setIsSearching(true);
    debounceRef.current = setTimeout(() => {
      searchCards(searchQuery, selectedGame);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, searchMode, selectedGame, searchCards]);

  const gameColor = (game: string) => {
    if (game === "pokemon") return colors.pokemon;
    if (game === "yugioh") return colors.yugioh;
    if (game === "mtg") return colors.mtg;
    return colors.tint;
  };

  const gameLabel = (game: string) => {
    if (game === "pokemon") return "Pokemon";
    if (game === "yugioh") return "Yu-Gi-Oh!";
    if (game === "mtg") return "Magic";
    return game;
  };

  const renderCardResult = ({ item }: { item: CardSearchResult }) => (
    <Pressable
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingVertical: 10,
          backgroundColor: pressed ? colors.surfaceAlt : "transparent",
        },
      ]}
      onPress={() => router.push(`/card/${item.game}/${item.id}`)}
    >
      <View
        style={{
          width: 40,
          height: 55,
          borderRadius: 6,
          overflow: "hidden",
          backgroundColor: colors.surfaceAlt,
          marginRight: 12,
        }}
      >
        {item.image ? (
          <Image
            source={{ uri: item.image }}
            style={{ width: 40, height: 55 }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="image-outline" size={18} color={colors.textTertiary} />
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: "DMSans_600SemiBold",
            fontSize: 15,
            color: colors.text,
          }}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        <Text
          style={{
            fontFamily: "DMSans_400Regular",
            fontSize: 13,
            color: colors.textSecondary,
            marginTop: 2,
          }}
          numberOfLines={1}
        >
          {item.setName}
        </Text>
        <View
          style={{
            alignSelf: "flex-start",
            backgroundColor: gameColor(item.game) + "18",
            borderRadius: 4,
            paddingHorizontal: 6,
            paddingVertical: 2,
            marginTop: 4,
          }}
        >
          <Text
            style={{
              fontFamily: "DMSans_500Medium",
              fontSize: 11,
              color: gameColor(item.game),
            }}
          >
            {gameLabel(item.game)}
          </Text>
        </View>
      </View>
      {item.price != null && (
        <Text
          style={{
            fontFamily: "DMSans_700Bold",
            fontSize: 14,
            color: colors.tint,
            marginLeft: 8,
          }}
        >
          ${item.price.toFixed(2)}
        </Text>
      )}
      <Ionicons
        name="chevron-forward"
        size={16}
        color={colors.textTertiary}
        style={{ marginLeft: 4 }}
      />
    </Pressable>
  );

  const renderSearchTabs = () => {
    if (searchQuery.length === 0) return null;
    return (
      <View
        style={{
          flexDirection: "row",
          marginHorizontal: 20,
          gap: 8,
        }}
      >
        <Pressable
          onPress={() => setSearchMode("sets")}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 7,
            borderRadius: 20,
            backgroundColor:
              searchMode === "sets" ? colors.tint : colors.surfaceAlt,
          }}
        >
          <Text
            style={{
              fontFamily: "DMSans_600SemiBold",
              fontSize: 13,
              color: searchMode === "sets" ? "#FFFFFF" : colors.textSecondary,
            }}
          >
            Sets
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setSearchMode("cards")}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 7,
            borderRadius: 20,
            backgroundColor:
              searchMode === "cards" ? colors.tint : colors.surfaceAlt,
          }}
        >
          <Text
            style={{
              fontFamily: "DMSans_600SemiBold",
              fontSize: 13,
              color: searchMode === "cards" ? "#FFFFFF" : colors.textSecondary,
            }}
          >
            Cards
          </Text>
        </Pressable>
      </View>
    );
  };

  const renderHeader = () => (
    <View style={{ gap: 16, paddingBottom: 16 }}>
      {isOffline && (
        <View style={{ backgroundColor: "#F59E0B", paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, marginHorizontal: 20, marginTop: topInset + 8, alignItems: "center" }}>
          <Text style={{ fontFamily: "DMSans_600SemiBold", fontSize: 12, color: "#FFFFFF" }}>Offline Mode - Showing cached sets</Text>
        </View>
      )}
      <View style={{ paddingHorizontal: 20, paddingTop: isOffline ? 4 : topInset + 8, paddingBottom: 4 }}>
        <Text
          style={{
            fontFamily: "DMSans_700Bold",
            fontSize: 28,
            color: colors.text,
          }}
        >
          Browse Sets
        </Text>
        <Text
          style={{
            fontFamily: "DMSans_400Regular",
            fontSize: 14,
            color: colors.textSecondary,
            marginTop: 2,
          }}
        >
          {sets?.length || 0} sets available
        </Text>
      </View>

      <GameSelector
        selected={selectedGame}
        onSelect={(g) => {
          setSelectedGame(g);
          setSearchQuery("");
          setCardResults([]);
          setSearchMode("sets");
        }}
      />


      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginHorizontal: 20,
          backgroundColor: colors.surface,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderWidth: 1,
          borderColor: colors.cardBorder,
        }}
      >
        <Ionicons name="search" size={18} color={colors.textTertiary} />
        <TextInput
          style={{
            flex: 1,
            fontFamily: "DMSans_400Regular",
            fontSize: 15,
            color: colors.text,
            padding: 0,
          }}
          placeholder={
            searchMode === "cards" ? "Search cards..." : "Search sets..."
          }
          placeholderTextColor={colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <Ionicons
            name="close-circle"
            size={18}
            color={colors.textTertiary}
            onPress={() => {
              setSearchQuery("");
              setCardResults([]);
              setSearchMode("sets");
            }}
          />
        )}
      </View>

      {renderSearchTabs()}

      {searchQuery.length === 0 && (
        <>
          <Pressable
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginHorizontal: 20,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 10,
              backgroundColor: colors.surfaceAlt,
              alignSelf: "flex-start",
            }}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowSortMenu(!showSortMenu);
            }}
          >
            <Ionicons name={(SET_SORT_OPTIONS.find(s => s.id === sortBy)?.icon || "list-outline") as any} size={16} color={colors.tint} />
            <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.text }}>
              {SET_SORT_OPTIONS.find(s => s.id === sortBy)?.label || "Default"}
            </Text>
            <Ionicons name={showSortMenu ? "chevron-up" : "chevron-down"} size={14} color={colors.textTertiary} />
          </Pressable>

          {showSortMenu && (
            <View style={{
              marginHorizontal: 20,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.cardBorder,
              backgroundColor: colors.surface,
              overflow: "hidden",
            }}>
              {SET_SORT_OPTIONS.map((opt) => {
                const active = sortBy === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      backgroundColor: active ? colors.tint + "12" : "transparent",
                    }}
                    onPress={() => {
                      setSortBy(opt.id);
                      setShowSortMenu(false);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Ionicons name={opt.icon as any} size={18} color={active ? colors.tint : colors.textSecondary} />
                    <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 14, color: active ? colors.tint : colors.text, flex: 1 }}>
                      {opt.label}
                    </Text>
                    {active && <Ionicons name="checkmark" size={18} color={colors.tint} />}
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      )}
    </View>
  );

  const showCardSearch = searchQuery.length > 0 && searchMode === "cards";

  if (showCardSearch) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <FlatList
          data={cardResults}
          keyExtractor={(item, index) => `${item.game}-${item.id}-${index}`}
          ListHeaderComponent={renderHeader()}
          ListEmptyComponent={() =>
            isSearching ? (
              <View style={{ paddingVertical: 60, alignItems: "center" }}>
                <ActivityIndicator size="large" color={colors.tint} />
                <Text
                  style={{
                    fontFamily: "DMSans_400Regular",
                    fontSize: 14,
                    color: colors.textSecondary,
                    marginTop: 12,
                  }}
                >
                  Searching...
                </Text>
              </View>
            ) : searchQuery.length < 2 ? (
              <View
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 60,
                  gap: 12,
                }}
              >
                <Ionicons
                  name="search-outline"
                  size={40}
                  color={colors.textTertiary}
                />
                <Text
                  style={{
                    fontFamily: "DMSans_400Regular",
                    fontSize: 14,
                    color: colors.textSecondary,
                  }}
                >
                  Type at least 2 characters to search
                </Text>
              </View>
            ) : (
              <View
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 60,
                  gap: 12,
                }}
              >
                <Ionicons
                  name="search-outline"
                  size={40}
                  color={colors.textTertiary}
                />
                <Text
                  style={{
                    fontFamily: "DMSans_400Regular",
                    fontSize: 14,
                    color: colors.textSecondary,
                  }}
                >
                  No cards found
                </Text>
              </View>
            )
          }
          renderItem={renderCardResult}
          ItemSeparatorComponent={() => (
            <View
              style={{
                height: 1,
                backgroundColor: colors.borderLight,
                marginLeft: 72,
              }}
            />
          )}
          contentContainerStyle={{
            paddingBottom: Platform.OS === "web" ? 84 + 34 : 100,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={filteredSets}
        keyExtractor={(item, index) => `${item.game}-${item.id}-${index}`}
        ListHeaderComponent={renderHeader()}
        ListEmptyComponent={() =>
          isLoading ? (
            <View style={{ paddingVertical: 60, alignItems: "center" }}>
              <ActivityIndicator size="large" color={colors.tint} />
            </View>
          ) : (
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 60,
                gap: 12,
              }}
            >
              <Ionicons
                name="search-outline"
                size={40}
                color={colors.textTertiary}
              />
              <Text
                style={{
                  fontFamily: "DMSans_400Regular",
                  fontSize: 14,
                  color: colors.textSecondary,
                }}
              >
                {searchQuery ? "No sets match your search" : "No sets found"}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <SetCard
            set={item}
            collectedCount={setCards(selectedGame, item.id)}
            onPress={() =>
              router.push({
                pathname: "/set/[game]/[id]",
                params: { game: selectedGame, id: item.id, lang: "en" },
              })
            }
          />
        )}
        contentContainerStyle={{
          paddingBottom: Platform.OS === "web" ? 84 + 34 : 100,
        }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}
