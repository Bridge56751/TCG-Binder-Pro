import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
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

  const inProgressSets = collectedSets.filter(
    (s) => s.totalCards > 0 && (collection[selectedGame]?.[s.id]?.length || 0) < s.totalCards
  );

  const completedSets = collectedSets.filter(
    (s) => s.totalCards > 0 && (collection[selectedGame]?.[s.id]?.length || 0) >= s.totalCards
  );

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 84 + 34 : 100;

  const gameColor = GAMES.find((g) => g.id === selectedGame)?.color || Colors.light.tint;

  const navigateToSet = (setId: string) => {
    router.push({
      pathname: "/set/[game]/[id]",
      params: { game: selectedGame, id: setId },
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: bottomInset }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.topBar, { paddingTop: topInset + 8 }]}>
        <Text style={styles.greeting}>My Collection</Text>
        <Text style={styles.subtitle}>
          {totalCards()} cards collected
        </Text>
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
          value={String(completedSets.length)}
          color={Colors.light.success}
        />
      </View>

      <View style={styles.selectorRow}>
        <GameSelector selected={selectedGame} onSelect={setSelectedGame} />
      </View>

      {isLoading && (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={Colors.light.tint} />
        </View>
      )}

      {!isLoading && collectedSets.length === 0 && (
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
      )}

      {inProgressSets.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="construct" size={18} color={gameColor} />
            <Text style={styles.sectionTitle}>Working On</Text>
            <View style={[styles.countBadge, { backgroundColor: gameColor + "18" }]}>
              <Text style={[styles.countBadgeText, { color: gameColor }]}>
                {inProgressSets.length}
              </Text>
            </View>
          </View>
          <Text style={styles.sectionSubtitle}>
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
            <Ionicons name="trophy" size={18} color={Colors.light.success} />
            <Text style={styles.sectionTitle}>Completed</Text>
            <View style={[styles.countBadge, { backgroundColor: Colors.light.success + "18" }]}>
              <Text style={[styles.countBadgeText, { color: Colors.light.success }]}>
                {completedSets.length}
              </Text>
            </View>
          </View>
          <Text style={styles.sectionSubtitle}>
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
    backgroundColor: Colors.light.background,
  },
  topBar: {
    paddingHorizontal: 20,
    paddingBottom: 16,
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
    marginBottom: 16,
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
    color: Colors.light.text,
    flex: 1,
  },
  sectionSubtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: Colors.light.textTertiary,
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
