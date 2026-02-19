import React, { useState, useRef, useEffect, useCallback } from "react";
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
import { GameSelector } from "@/components/GameSelector";
import { SetCard } from "@/components/SetCard";
import { useCollection } from "@/lib/CollectionContext";
import { useTheme } from "@/lib/ThemeContext";
import { apiRequest } from "@/lib/query-client";
import type { GameId, TCGSet } from "@/lib/types";

type SearchMode = "sets" | "cards";

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
  const { setCards, enabledGames } = useCollection();

  useEffect(() => {
    if (!enabledGames.includes(selectedGame) && enabledGames.length > 0) {
      setSelectedGame(enabledGames[0]);
    }
  }, [enabledGames, selectedGame]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setsQueryPath = `/api/tcg/${selectedGame}/sets`;

  const { data: sets, isLoading } = useQuery<TCGSet[]>({
    queryKey: [setsQueryPath],
  });

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const filteredSets =
    sets?.filter(
      (s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.id.toLowerCase().includes(searchQuery.toLowerCase()),
    ) || [];

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
    if (game === "onepiece") return colors.onepiece;
    if (game === "mtg") return colors.mtg;
    return colors.tint;
  };

  const gameLabel = (game: string) => {
    if (game === "pokemon") return "Pokemon";
    if (game === "yugioh") return "Yu-Gi-Oh!";
    if (game === "onepiece") return "One Piece";
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
      <View style={{ paddingHorizontal: 20, paddingTop: topInset + 8, paddingBottom: 4 }}>
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
