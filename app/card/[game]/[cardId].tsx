import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform,
  Pressable,
  ActivityIndicator,
  Dimensions,
  Alert,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/ThemeContext";
import { useCollection } from "@/lib/CollectionContext";
import {
  getTradeList,
  addToTradeList,
  removeFromTradeList,
  isOnTradeList,
} from "@/lib/trade-list-storage";
import type { TradeItem } from "@/lib/trade-list-storage";
import type { CardDetail, GameId } from "@/lib/types";
import { GAMES } from "@/lib/types";

const screenWidth = Dimensions.get("window").width;

function getMarketplaceLinks(cardName: string, game: GameId) {
  const encoded = encodeURIComponent(cardName);
  const gameLabels: Record<GameId, string> = {
    pokemon: "Pokemon",
    yugioh: "Yu-Gi-Oh!",
    onepiece: "One Piece",
    mtg: "Magic: The Gathering",
  };
  const tcgPlayerCategories: Record<GameId, string> = {
    pokemon: "pokemon",
    yugioh: "yugioh",
    onepiece: "one-piece-card-game",
    mtg: "magic",
  };
  const links = [
    {
      name: "TCGPlayer",
      url: `https://www.tcgplayer.com/search/all/product?q=${encoded}&productLineName=${tcgPlayerCategories[game]}`,
      icon: "cart-outline",
      color: "#1D4ED8",
    },
    {
      name: "eBay",
      url: `https://www.ebay.com/sch/i.html?_nkw=${encoded}+${encodeURIComponent(gameLabels[game])}+card`,
      icon: "pricetag-outline",
      color: "#E53238",
    },
    {
      name: "Cardmarket",
      url: `https://www.cardmarket.com/en/Search?searchString=${encoded}`,
      icon: "globe-outline",
      color: "#0F766E",
    },
  ];
  if (game === "mtg") {
    links.push({
      name: "Card Kingdom",
      url: `https://www.cardkingdom.com/catalog/search?search=header&filter%5Bname%5D=${encoded}`,
      icon: "shield-outline",
      color: "#7C3AED",
    });
  }
  return links;
}

export default function CardDetailScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { game, cardId, lang } = useLocalSearchParams<{ game: string; cardId: string; lang?: string }>();
  const gameId = game as GameId;
  const { hasCard, removeCard, cardQuantity } = useCollection();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const gameInfo = GAMES.find((g) => g.id === gameId);

  const [tradeList, setTradeList] = useState<TradeItem[]>([]);
  const flipAnim = useSharedValue(90);

  useEffect(() => {
    getTradeList().then(setTradeList);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      flipAnim.value = withTiming(0, { duration: 600 });
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const flipStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipAnim.value, [0, 90], [0, 90]);
    return {
      transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
    };
  });

  const cardLang = lang === "ja" ? "ja" : "en";
  const cardQueryPath = gameId === "pokemon" && cardLang === "ja"
    ? `/api/tcg/${game}/card/${cardId}?lang=ja`
    : `/api/tcg/${game}/card/${cardId}`;

  const { data: card, isLoading } = useQuery<CardDetail>({
    queryKey: [cardQueryPath],
  });

  const onTrade = card ? isOnTradeList(tradeList, gameId, card.id) : false;

  const handleTradeToggle = async () => {
    if (!card) return;
    if (onTrade) {
      const updated = await removeFromTradeList(gameId, card.id);
      setTradeList(updated);
    } else {
      const updated = await addToTradeList(gameId, card.setId, card.id);
      setTradeList(updated);
    }
  };

  const isInCollection = card ? hasCard(gameId, card.setId, cardId || "") : false;

  const handleRemoveCard = () => {
    if (!card) return;
    Alert.alert(
      "Remove Card",
      `Remove ${card.name} from your collection?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await removeCard(gameId, card.setId, cardId || "");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            router.back();
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading card details...</Text>
      </View>
    );
  }

  if (!card) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.textTertiary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Card not found</Text>
      </View>
    );
  }

  const hasPrice = card.currentPrice != null && card.currentPrice > 0;
  const priceChangePercent = card.priceLow != null && card.currentPrice != null && card.priceLow > 0
    ? Math.round(((card.currentPrice - card.priceLow) / card.priceLow) * 100)
    : 0;
  const priceUp = priceChangePercent >= 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset + 20 }}
      >
        <View style={[styles.topBar, { paddingTop: topInset + 8 }]}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{card.name}</Text>
            <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
              {card.setName} - #{card.localId}
            </Text>
          </View>
          {isInCollection && (
            <Pressable style={styles.actionButton} onPress={handleRemoveCard}>
              <Ionicons name="trash-outline" size={22} color={colors.error} />
            </Pressable>
          )}
          <Pressable style={styles.actionButton} onPress={handleTradeToggle}>
            <Ionicons
              name="swap-horizontal"
              size={22}
              color={onTrade ? colors.tint : colors.textTertiary}
            />
            {onTrade && (
              <View style={[styles.actionDot, { backgroundColor: colors.tint }]} />
            )}
          </Pressable>
        </View>

        <View style={styles.imageSection}>
          <Animated.View style={flipStyle}>
            {card.image ? (
              <Image
                source={{ uri: card.image }}
                style={styles.cardImage}
                contentFit="contain"
                transition={300}
              />
            ) : (
              <View style={[styles.cardImage, styles.noImage, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="image-outline" size={48} color={colors.textTertiary} />
              </View>
            )}
            {onTrade && (
              <View style={[styles.tradeBadge, { backgroundColor: colors.tint }]}>
                <Ionicons name="swap-horizontal" size={10} color="#FFFFFF" />
                <Text style={styles.tradeBadgeText}>For Trade</Text>
              </View>
            )}
          </Animated.View>
        </View>

        <View style={styles.infoSection}>
          <View style={styles.badgeRow}>
            {card.rarity && (
              <View style={[styles.badge, { backgroundColor: (gameInfo?.color || colors.tint) + "18" }]}>
                <Ionicons name="diamond" size={12} color={gameInfo?.color || colors.tint} />
                <Text style={[styles.badgeText, { color: gameInfo?.color || colors.tint }]}>
                  {card.rarity}
                </Text>
              </View>
            )}
            {card.cardType && (
              <View style={[styles.badge, { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
                  {card.cardType}
                </Text>
              </View>
            )}
            {card.hp != null && (
              <View style={[styles.badge, { backgroundColor: colors.error + "18" }]}>
                <Ionicons name="heart" size={12} color={colors.error} />
                <Text style={[styles.badgeText, { color: colors.error }]}>
                  {gameId === "yugioh" ? `ATK ${card.hp}` : gameId === "mtg" ? `P ${card.hp}` : `HP ${card.hp}`}
                </Text>
              </View>
            )}
            {isInCollection && (() => {
              const qty = cardQuantity(gameId, card.setId, cardId || "");
              return (
                <View style={[styles.badge, { backgroundColor: colors.success + "18" }]}>
                  <Ionicons name="layers" size={12} color={colors.success} />
                  <Text style={[styles.badgeText, { color: colors.success }]}>
                    x{qty} owned
                  </Text>
                </View>
              );
            })()}
          </View>

          {card.artist && (
            <View style={styles.artistRow}>
              <Ionicons name="brush" size={14} color={colors.textTertiary} />
              <Text style={[styles.artistText, { color: colors.textTertiary }]}>Illustrated by {card.artist}</Text>
            </View>
          )}

          {card.description && (
            <View style={[styles.descCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
              <Text style={[styles.descLabel, { color: colors.textSecondary }]}>Card Details</Text>
              <Text style={[styles.descText, { color: colors.text }]}>{card.description}</Text>
            </View>
          )}
        </View>

        {hasPrice && (
          <View style={styles.priceSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Market Price</Text>

            <View style={[styles.priceCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
              <View style={styles.priceMain}>
                <Text style={[styles.priceValue, { color: colors.text }]}>
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

              <View style={[styles.priceRange, { borderTopColor: colors.surfaceAlt }]}>
                {card.priceLow != null && (
                  <View style={styles.priceRangeItem}>
                    <Text style={[styles.priceRangeLabel, { color: colors.textTertiary }]}>Low</Text>
                    <Text style={[styles.priceRangeValue, { color: colors.text }]}>
                      ${card.priceLow.toFixed(2)}
                    </Text>
                  </View>
                )}
                <View style={styles.priceRangeItem}>
                  <Text style={[styles.priceRangeLabel, { color: colors.textTertiary }]}>Market</Text>
                  <Text style={[styles.priceRangeValue, { color: colors.tint }]}>
                    ${card.currentPrice!.toFixed(2)}
                  </Text>
                </View>
                {card.priceHigh != null && (
                  <View style={styles.priceRangeItem}>
                    <Text style={[styles.priceRangeLabel, { color: colors.textTertiary }]}>High</Text>
                    <Text style={[styles.priceRangeValue, { color: colors.text }]}>
                      ${card.priceHigh.toFixed(2)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {!hasPrice && (
          <View style={styles.noPriceSection}>
            <Ionicons name="pricetag-outline" size={32} color={colors.textTertiary} />
            <Text style={[styles.noPriceText, { color: colors.textTertiary }]}>Price data not available for this card</Text>
          </View>
        )}

        <View style={styles.marketplaceSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Buy This Card</Text>
          <View style={styles.marketplaceGrid}>
            {getMarketplaceLinks(card.name, gameId).map((mp) => (
              <Pressable
                key={mp.name}
                style={[styles.marketplaceCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
                onPress={() => Linking.openURL(mp.url)}
              >
                <View style={[styles.marketplaceIcon, { backgroundColor: mp.color + "18" }]}>
                  <Ionicons name={mp.icon as any} size={20} color={mp.color} />
                </View>
                <Text style={[styles.marketplaceName, { color: colors.text }]}>{mp.name}</Text>
                <Ionicons name="open-outline" size={14} color={colors.textTertiary} />
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
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
  actionButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  actionDot: {
    position: "absolute",
    bottom: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerInfo: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 20,
  },
  headerSub: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
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
    alignItems: "center",
    justifyContent: "center",
  },
  tradeBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tradeBadgeText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 10,
    color: "#FFFFFF",
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
  },
  descCard: {
    borderRadius: 12,
    padding: 16,
    gap: 8,
    borderWidth: 1,
  },
  descLabel: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
  },
  descText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
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
  },
  priceCard: {
    borderRadius: 14,
    padding: 16,
    gap: 16,
    borderWidth: 1,
  },
  priceMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  priceValue: {
    fontFamily: "DMSans_700Bold",
    fontSize: 32,
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
  },
  priceRangeItem: {
    alignItems: "center",
    gap: 4,
  },
  priceRangeLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
  },
  priceRangeValue: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
  },
  noPriceSection: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  noPriceText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
  },
  marketplaceSection: {
    paddingHorizontal: 20,
    marginTop: 24,
    gap: 12,
  },
  marketplaceGrid: {
    gap: 10,
  },
  marketplaceCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  marketplaceIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  marketplaceName: {
    flex: 1,
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
  },
});
