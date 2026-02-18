import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Platform,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useCollection } from "@/lib/CollectionContext";
import { GameSelector } from "@/components/GameSelector";
import { SetCard } from "@/components/SetCard";
import { StatCard } from "@/components/StatCard";
import type { GameId, TCGSet } from "@/lib/types";
import { GAMES } from "@/lib/types";
import { getApiUrl } from "@/lib/query-client";

export default function CollectionScreen() {
  const insets = useSafeAreaInsets();
  const [selectedGame, setSelectedGame] = useState<GameId>("pokemon");
  const { totalCards, setCards, collection } = useCollection();

  const { data: sets, isLoading } = useQuery<TCGSet[]>({
    queryKey: [`/api/tcg/${selectedGame}/sets`],
  });

  const collectedSets = sets?.filter(
    (s) => (collection[selectedGame]?.[s.id]?.length || 0) > 0
  ) || [];

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const gameColor = GAMES.find((g) => g.id === selectedGame)?.color || Colors.light.tint;

  const renderHeader = () => (
    <View style={styles.headerContent}>
      <View style={[styles.topBar, { paddingTop: topInset + 8 }]}>
        <View>
          <Text style={styles.greeting}>My Collection</Text>
          <Text style={styles.subtitle}>
            {totalCards()} cards collected
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <StatCard
          icon="layers"
          label="Total Cards"
          value={String(totalCards())}
          color={Colors.light.tint}
        />
        <StatCard
          icon="albums"
          label="Sets Started"
          value={String(collectedSets.length)}
          color={gameColor}
        />
        <StatCard
          icon="star"
          label="Complete"
          value={String(
            sets?.filter(
              (s) => s.totalCards > 0 && (collection[selectedGame]?.[s.id]?.length || 0) >= s.totalCards
            ).length || 0
          )}
          color={Colors.light.success}
        />
      </View>

      <GameSelector selected={selectedGame} onSelect={setSelectedGame} />

      {collectedSets.length > 0 && (
        <Text style={styles.sectionTitle}>In Progress</Text>
      )}
    </View>
  );

  const renderEmpty = () => {
    if (isLoading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={Colors.light.tint} />
        </View>
      );
    }
    return (
      <View style={styles.emptyState}>
        <Ionicons name="albums-outline" size={48} color={Colors.light.textTertiary} />
        <Text style={styles.emptyTitle}>No cards yet</Text>
        <Text style={styles.emptyText}>
          Scan your first card or browse sets to start building your collection
        </Text>
        <Pressable
          style={styles.emptyButton}
          onPress={() => router.push("/(tabs)/scan")}
        >
          <Ionicons name="scan" size={18} color="#FFFFFF" />
          <Text style={styles.emptyButtonText}>Scan a Card</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={collectedSets}
        keyExtractor={(item) => `${item.game}-${item.id}`}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        renderItem={({ item }) => (
          <SetCard
            set={item}
            collectedCount={setCards(selectedGame, item.id)}
            onPress={() =>
              router.push({
                pathname: "/set/[game]/[id]",
                params: { game: selectedGame, id: item.id },
              })
            }
          />
        )}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Platform.OS === "web" ? 84 + 34 : 100 },
        ]}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  headerContent: {
    gap: 16,
    paddingBottom: 16,
  },
  topBar: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  greeting: {
    fontFamily: "DMSans_700Bold",
    fontSize: 28,
    color: Colors.light.text,
  },
  subtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: Colors.light.text,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  listContent: {
    gap: 0,
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
    color: Colors.light.text,
  },
  emptyText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.light.tint,
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
