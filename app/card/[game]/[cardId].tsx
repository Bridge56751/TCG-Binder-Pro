import React from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform,
  Pressable,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LineChart } from "react-native-chart-kit";
import Colors from "@/constants/colors";
import type { CardDetail, GameId } from "@/lib/types";
import { GAMES } from "@/lib/types";

const screenWidth = Dimensions.get("window").width;

export default function CardDetailScreen() {
  const insets = useSafeAreaInsets();
  const { game, cardId } = useLocalSearchParams<{ game: string; cardId: string }>();
  const gameId = game as GameId;
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const gameInfo = GAMES.find((g) => g.id === gameId);

  const { data: card, isLoading } = useQuery<CardDetail>({
    queryKey: [`/api/tcg/${game}/card/${cardId}`],
  });

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <Text style={styles.loadingText}>Loading card details...</Text>
      </View>
    );
  }

  if (!card) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.light.textTertiary} />
        <Text style={styles.loadingText}>Card not found</Text>
      </View>
    );
  }

  const hasPrice = card.currentPrice != null && card.currentPrice > 0;
  const hasPriceHistory = card.priceHistory && card.priceHistory.length > 0;

  const chartLabels = hasPriceHistory
    ? card.priceHistory
        .filter((_: any, i: number) => i % 15 === 0 || i === card.priceHistory.length - 1)
        .map((p: any) => {
          const d = new Date(p.date);
          return `${d.getMonth() + 1}/${d.getDate()}`;
        })
    : [];

  const chartData = hasPriceHistory ? card.priceHistory.map((p: any) => p.price) : [];

  const priceChange = hasPriceHistory && card.priceHistory.length >= 2
    ? card.priceHistory[card.priceHistory.length - 1].price - card.priceHistory[0].price
    : 0;

  const priceChangePercent = hasPriceHistory && card.priceHistory.length >= 2 && card.priceHistory[0].price > 0
    ? ((priceChange / card.priceHistory[0].price) * 100).toFixed(1)
    : "0";

  const priceUp = priceChange >= 0;

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset + 20 }}
      >
        <View style={[styles.topBar, { paddingTop: topInset + 8 }]}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={Colors.light.text} />
          </Pressable>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle} numberOfLines={1}>{card.name}</Text>
            <Text style={styles.headerSub}>
              {card.setName} - #{card.localId}
            </Text>
          </View>
        </View>

        <View style={styles.imageSection}>
          {card.image ? (
            <Image
              source={{ uri: card.image }}
              style={styles.cardImage}
              contentFit="contain"
              transition={300}
            />
          ) : (
            <View style={[styles.cardImage, styles.noImage]}>
              <Ionicons name="image-outline" size={48} color={Colors.light.textTertiary} />
            </View>
          )}
        </View>

        <View style={styles.infoSection}>
          <View style={styles.badgeRow}>
            {card.rarity && (
              <View style={[styles.badge, { backgroundColor: (gameInfo?.color || Colors.light.tint) + "18" }]}>
                <Ionicons name="diamond" size={12} color={gameInfo?.color || Colors.light.tint} />
                <Text style={[styles.badgeText, { color: gameInfo?.color || Colors.light.tint }]}>
                  {card.rarity}
                </Text>
              </View>
            )}
            {card.cardType && (
              <View style={[styles.badge, { backgroundColor: Colors.light.surfaceAlt }]}>
                <Text style={[styles.badgeText, { color: Colors.light.textSecondary }]}>
                  {card.cardType}
                </Text>
              </View>
            )}
            {card.hp != null && (
              <View style={[styles.badge, { backgroundColor: Colors.light.error + "18" }]}>
                <Ionicons name="heart" size={12} color={Colors.light.error} />
                <Text style={[styles.badgeText, { color: Colors.light.error }]}>
                  {gameId === "yugioh" ? `ATK ${card.hp}` : `HP ${card.hp}`}
                </Text>
              </View>
            )}
          </View>

          {card.artist && (
            <View style={styles.artistRow}>
              <Ionicons name="brush" size={14} color={Colors.light.textTertiary} />
              <Text style={styles.artistText}>Illustrated by {card.artist}</Text>
            </View>
          )}

          {card.description && (
            <View style={styles.descCard}>
              <Text style={styles.descLabel}>Card Details</Text>
              <Text style={styles.descText}>{card.description}</Text>
            </View>
          )}
        </View>

        {hasPrice && (
          <View style={styles.priceSection}>
            <Text style={styles.sectionTitle}>Market Price</Text>

            <View style={styles.priceCard}>
              <View style={styles.priceMain}>
                <Text style={styles.priceValue}>
                  {card.priceUnit === "EUR" ? "\u20AC" : "$"}
                  {card.currentPrice!.toFixed(2)}
                </Text>
                <View style={[styles.changeBadge, priceUp ? styles.changeUp : styles.changeDown]}>
                  <Ionicons
                    name={priceUp ? "trending-up" : "trending-down"}
                    size={14}
                    color={priceUp ? "#2D8B55" : "#D4675A"}
                  />
                  <Text style={[styles.changeText, priceUp ? styles.changeTextUp : styles.changeTextDown]}>
                    {priceUp ? "+" : ""}{priceChangePercent}%
                  </Text>
                </View>
              </View>

              <View style={styles.priceRange}>
                {card.priceLow != null && (
                  <View style={styles.priceRangeItem}>
                    <Text style={styles.priceRangeLabel}>Low</Text>
                    <Text style={styles.priceRangeValue}>
                      ${card.priceLow.toFixed(2)}
                    </Text>
                  </View>
                )}
                <View style={styles.priceRangeItem}>
                  <Text style={styles.priceRangeLabel}>Market</Text>
                  <Text style={[styles.priceRangeValue, { color: Colors.light.tint }]}>
                    ${card.currentPrice!.toFixed(2)}
                  </Text>
                </View>
                {card.priceHigh != null && (
                  <View style={styles.priceRangeItem}>
                    <Text style={styles.priceRangeLabel}>High</Text>
                    <Text style={styles.priceRangeValue}>
                      ${card.priceHigh.toFixed(2)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {hasPriceHistory && chartData.length > 2 && (
          <View style={styles.chartSection}>
            <View style={styles.chartHeader}>
              <Text style={styles.sectionTitle}>90-Day Price History</Text>
              <View style={[styles.trendIcon, priceUp ? styles.trendUp : styles.trendDown]}>
                <MaterialCommunityIcons
                  name={priceUp ? "arrow-top-right" : "arrow-bottom-right"}
                  size={16}
                  color={priceUp ? "#2D8B55" : "#D4675A"}
                />
              </View>
            </View>

            <View style={styles.chartCard}>
              <LineChart
                data={{
                  labels: chartLabels,
                  datasets: [{ data: chartData }],
                }}
                width={screenWidth - 72}
                height={200}
                yAxisLabel="$"
                yAxisSuffix=""
                withInnerLines={false}
                withOuterLines={false}
                withDots={false}
                withShadow={false}
                chartConfig={{
                  backgroundColor: "#FFFFFF",
                  backgroundGradientFrom: "#FFFFFF",
                  backgroundGradientTo: "#FFFFFF",
                  decimalPlaces: 2,
                  color: () => gameInfo?.color || Colors.light.tint,
                  labelColor: () => Colors.light.textTertiary,
                  propsForBackgroundLines: {
                    strokeDasharray: "",
                    stroke: Colors.light.surfaceAlt,
                    strokeWidth: 1,
                  },
                  propsForLabels: {
                    fontSize: 10,
                    fontFamily: "DMSans_400Regular",
                  },
                }}
                bezier
                style={styles.chart}
              />
            </View>
          </View>
        )}

        {!hasPrice && (
          <View style={styles.noPriceSection}>
            <Ionicons name="pricetag-outline" size={32} color={Colors.light.textTertiary} />
            <Text style={styles.noPriceText}>Price data not available for this card</Text>
          </View>
        )}
      </ScrollView>
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
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
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
  headerTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 20,
    color: Colors.light.text,
  },
  headerSub: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  imageSection: {
    alignItems: "center",
    paddingHorizontal: 40,
    paddingVertical: 8,
  },
  cardImage: {
    width: screenWidth * 0.6,
    height: screenWidth * 0.6 / 0.72,
    borderRadius: 12,
  },
  noImage: {
    backgroundColor: Colors.light.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  infoSection: {
    paddingHorizontal: 20,
    gap: 12,
    marginTop: 16,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  badgeText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 12,
  },
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  artistText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: Colors.light.textTertiary,
  },
  descCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.light.cardBorder,
  },
  descLabel: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  descText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: Colors.light.text,
    lineHeight: 20,
  },
  priceSection: {
    paddingHorizontal: 20,
    marginTop: 24,
    gap: 12,
  },
  sectionTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: Colors.light.text,
  },
  priceCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
    gap: 16,
    borderWidth: 1,
    borderColor: Colors.light.cardBorder,
  },
  priceMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  priceValue: {
    fontFamily: "DMSans_700Bold",
    fontSize: 32,
    color: Colors.light.text,
  },
  changeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  changeUp: {
    backgroundColor: "#E8F5ED",
  },
  changeDown: {
    backgroundColor: "#FDE8E5",
  },
  changeText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
  },
  changeTextUp: {
    color: "#2D8B55",
  },
  changeTextDown: {
    color: "#D4675A",
  },
  priceRange: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.surfaceAlt,
  },
  priceRangeItem: {
    alignItems: "center",
    gap: 4,
  },
  priceRangeLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: Colors.light.textTertiary,
  },
  priceRangeValue: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: Colors.light.text,
  },
  chartSection: {
    paddingHorizontal: 20,
    marginTop: 24,
    gap: 12,
  },
  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  trendIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  trendUp: {
    backgroundColor: "#E8F5ED",
  },
  trendDown: {
    backgroundColor: "#FDE8E5",
  },
  chartCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.light.cardBorder,
    alignItems: "center",
  },
  chart: {
    borderRadius: 12,
  },
  noPriceSection: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  noPriceText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: Colors.light.textTertiary,
  },
});
