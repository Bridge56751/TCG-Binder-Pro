import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Platform,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { GameSelector } from "@/components/GameSelector";
import { SetCard } from "@/components/SetCard";
import { useCollection } from "@/lib/CollectionContext";
import type { GameId, TCGSet } from "@/lib/types";

export default function SetsScreen() {
  const insets = useSafeAreaInsets();
  const [selectedGame, setSelectedGame] = useState<GameId>("pokemon");
  const [searchQuery, setSearchQuery] = useState("");
  const { setCards } = useCollection();

  const { data: sets, isLoading } = useQuery<TCGSet[]>({
    queryKey: [`/api/tcg/${selectedGame}/sets`],
  });

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const filteredSets = sets?.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.id.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const renderHeader = () => (
    <View style={styles.headerContent}>
      <View style={[styles.topBar, { paddingTop: topInset + 8 }]}>
        <Text style={styles.title}>Browse Sets</Text>
        <Text style={styles.subtitle}>
          {sets?.length || 0} sets available
        </Text>
      </View>

      <GameSelector selected={selectedGame} onSelect={(g) => { setSelectedGame(g); setSearchQuery(""); }} />

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={Colors.light.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search sets..."
          placeholderTextColor={Colors.light.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <Ionicons
            name="close-circle"
            size={18}
            color={Colors.light.textTertiary}
            onPress={() => setSearchQuery("")}
          />
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredSets}
        keyExtractor={(item) => `${item.game}-${item.id}`}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={() =>
          isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={Colors.light.tint} />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={40} color={Colors.light.textTertiary} />
              <Text style={styles.emptyText}>
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
  title: {
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
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 20,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.light.cardBorder,
  },
  searchInput: {
    flex: 1,
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    color: Colors.light.text,
    padding: 0,
  },
  listContent: {
    gap: 0,
  },
  loading: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
});
