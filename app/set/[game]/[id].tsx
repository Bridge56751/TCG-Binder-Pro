import React from "react";
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
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { CardCell } from "@/components/CardCell";
import { useCollection } from "@/lib/CollectionContext";
import type { GameId, SetDetail } from "@/lib/types";
import { GAMES } from "@/lib/types";

const NUM_COLUMNS = 3;

export default function SetDetailScreen() {
  const insets = useSafeAreaInsets();
  const { game, id } = useLocalSearchParams<{ game: string; id: string }>();
  const gameId = game as GameId;
  const { hasCard, setCards } = useCollection();

  const { data: setDetail, isLoading } = useQuery<SetDetail>({
    queryKey: [`/api/tcg/${game}/sets/${id}/cards`],
  });

  const gameInfo = GAMES.find((g) => g.id === gameId);
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const collectedCount = setCards(gameId, id || "");
  const totalCards = setDetail?.totalCards || 0;
  const progress = totalCards > 0 ? collectedCount / totalCards : 0;

  const renderHeader = () => (
    <View style={styles.headerSection}>
      <View style={[styles.topBar, { paddingTop: topInset + 8 }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.light.text} />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.setName} numberOfLines={1}>
            {setDetail?.name || id}
          </Text>
          <Text style={styles.setMeta}>
            {id} - {gameInfo?.name}
          </Text>
        </View>
        <Pressable
          style={styles.scanButton}
          onPress={() => router.push("/(tabs)/scan")}
        >
          <Ionicons name="scan" size={18} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={styles.progressSection}>
        <View style={styles.progressInfo}>
          <Text style={styles.progressLabel}>Collection Progress</Text>
          <Text style={styles.progressValue}>
            {collectedCount}/{totalCards}
          </Text>
        </View>
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${Math.min(progress * 100, 100)}%`,
                backgroundColor:
                  progress >= 1 ? Colors.light.success : gameInfo?.color || Colors.light.tint,
              },
            ]}
          />
        </View>
        <Text style={styles.progressPercent}>
          {Math.round(progress * 100)}% Complete
        </Text>
      </View>

      <View style={styles.binderHeader}>
        <View>
          <Text style={styles.binderTitle}>Binder View</Text>
          <Text style={styles.binderSubtitle}>Scan cards to fill in your collection</Text>
        </View>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <Text style={styles.loadingText}>Loading set...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={setDetail?.cards || []}
        keyExtractor={(item) => item.id}
        numColumns={NUM_COLUMNS}
        ListHeaderComponent={renderHeader}
        renderItem={({ item }) => (
          <View style={styles.cellWrapper}>
            <CardCell
              cardId={item.id}
              localId={item.localId}
              name={item.name}
              imageUrl={item.image}
              isCollected={hasCard(gameId, id || "", item.id)}
              onPress={() => {}}
            />
          </View>
        )}
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
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
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
  setName: {
    fontFamily: "DMSans_700Bold",
    fontSize: 22,
    color: Colors.light.text,
  },
  setMeta: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  scanButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  progressSection: {
    marginHorizontal: 20,
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.light.cardBorder,
  },
  progressInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  progressValue: {
    fontFamily: "DMSans_700Bold",
    fontSize: 16,
    color: Colors.light.text,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.light.surfaceAlt,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressPercent: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: Colors.light.textTertiary,
    textAlign: "right",
  },
  binderHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 16,
  },
  binderTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: Colors.light.text,
  },
  binderSubtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: Colors.light.textTertiary,
    marginTop: 2,
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
