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
  withSpring,
  withSequence,
  withDelay,
  interpolate,
  FadeIn,
  ZoomIn,
  SlideInDown,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/ThemeContext";
import { useCollection } from "@/lib/CollectionContext";
import type { CardDetail, GameId } from "@/lib/types";
import { GAMES } from "@/lib/types";

const screenWidth = Dimensions.get("window").width;

function getMarketplaceLinks(card: CardDetail) {
  const game = card.game;
  const cardName = card.name;
  const setName = card.setName;
  const localId = card.localId;

  const tcgPlayerCategories: Record<GameId, string> = {
    pokemon: "pokemon",
    yugioh: "yugioh",
    onepiece: "one-piece-card-game",
    mtg: "magic",
  };
  const tcgQuery = encodeURIComponent(`${cardName} ${setName}`);
  const ebayQuery = encodeURIComponent(`${cardName} ${localId} ${setName}`);

  const links = [
    {
      name: "TCGPlayer",
      url: `https://www.tcgplayer.com/search/all/product?q=${tcgQuery}&productLineName=${tcgPlayerCategories[game]}`,
      icon: "cart-outline",
      color: "#1D4ED8",
    },
    {
      name: "eBay",
      url: `https://www.ebay.com/sch/i.html?_nkw=${ebayQuery}`,
      icon: "pricetag-outline",
      color: "#E53238",
    },
  ];
  return links;
}

export default function CardDetailScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { game, cardId, lang } = useLocalSearchParams<{ game: string; cardId: string; lang?: string }>();
  const gameId = game as GameId;
  const { hasCard, removeCard, addCard, cardQuantity } = useCollection();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const gameInfo = GAMES.find((g) => g.id === gameId);

  const [justAdded, setJustAdded] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const flipAnim = useSharedValue(90);
  const addScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);
  const badgeScale = useSharedValue(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      flipAnim.value = withTiming(0, { duration: 600 });
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const flipStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipAnim.value, [0, 90], [0, 90]);
    return {
      transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }, { scale: addScale.value }],
    };
  });

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const ownedBadgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
  }));

  const cardLang = lang === "ja" ? "ja" : "en";
  const cardQueryPath = gameId === "pokemon" && cardLang === "ja"
    ? `/api/tcg/${game}/card/${cardId}?lang=ja`
    : `/api/tcg/${game}/card/${cardId}`;

  const { data: card, isLoading } = useQuery<CardDetail>({
    queryKey: [cardQueryPath],
  });

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
        <View style={{ paddingTop: topInset }} />
        <Pressable style={styles.notFoundBack} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Ionicons name="search-outline" size={48} color={colors.textTertiary} />
        <Text style={[styles.notFoundTitle, { color: colors.text }]}>Hard to Find</Text>
        <Text style={[styles.notFoundDesc, { color: colors.textSecondary }]}>
          This card's info is hard to come by right now. It may be a rare or newly released card that hasn't been cataloged yet.
        </Text>
        <Pressable style={[styles.notFoundBtn, { backgroundColor: colors.tint }]} onPress={() => router.back()}>
          <Text style={styles.notFoundBtnText}>Go Back</Text>
        </Pressable>
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
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
              {card.englishName || card.name}
            </Text>
            {card.englishName && card.englishName !== card.name && (
              <Text style={[styles.headerSub, { color: colors.textTertiary }]} numberOfLines={1}>
                {card.name}
              </Text>
            )}
            <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
              {card.englishSetName || card.setName} - #{card.localId}
            </Text>
          </View>
          {isInCollection && (
            <Pressable style={styles.actionButton} onPress={handleRemoveCard}>
              <Ionicons name="trash-outline" size={22} color={colors.error} />
            </Pressable>
          )}
        </View>

        <View style={styles.imageSection}>
          <Animated.View style={flipStyle}>
            {card.image ? (
              <Image
                source={{ uri: card.image }}
                style={styles.cardImage}
                contentFit="contain"
                transition={300}
                cachePolicy="disk"
              />
            ) : (
              <View style={[styles.cardImage, styles.noImage, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="image-outline" size={48} color={colors.textTertiary} />
              </View>
            )}
            <Animated.View
              style={[styles.addGlow, { borderColor: gameInfo?.color || colors.tint }, glowStyle]}
              pointerEvents="none"
            />
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
              return justAdded ? (
                <Animated.View
                  style={[styles.badge, { backgroundColor: colors.success + "18" }, ownedBadgeStyle]}
                >
                  <Ionicons name="layers" size={12} color={colors.success} />
                  <Text style={[styles.badgeText, { color: colors.success }]}>
                    x{qty} owned
                  </Text>
                </Animated.View>
              ) : (
                <View style={[styles.badge, { backgroundColor: colors.success + "18" }]}>
                  <Ionicons name="layers" size={12} color={colors.success} />
                  <Text style={[styles.badgeText, { color: colors.success }]}>
                    x{qty} owned
                  </Text>
                </View>
              );
            })()}
          </View>

          {!isInCollection && !limitReached && (
            <Pressable
              style={[styles.addBinderBtn, { backgroundColor: colors.tint }]}
              onPress={async () => {
                try {
                  await addCard(gameId, card.setId, cardId || "");
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setJustAdded(true);
                  addScale.value = withSequence(
                    withTiming(1.08, { duration: 150 }),
                    withSpring(1, { damping: 8, stiffness: 200 })
                  );
                  glowOpacity.value = withSequence(
                    withTiming(1, { duration: 200 }),
                    withDelay(400, withTiming(0, { duration: 500 }))
                  );
                  badgeScale.value = withDelay(100, withSpring(1, { damping: 6, stiffness: 300 }));
                } catch (err: any) {
                  if (err?.message === "FREE_LIMIT" || err?.message === "GUEST_LIMIT") {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                    setLimitReached(true);
                  }
                }
              }}
            >
              <Ionicons name="add-circle" size={20} color="#FFFFFF" />
              <Text style={styles.addBinderBtnText}>Add to Binder</Text>
            </Pressable>
          )}

          {limitReached && !isInCollection && (
            <View style={[styles.limitCard, { backgroundColor: colors.error + "12", borderColor: colors.error + "30" }]}>
              <Ionicons name="lock-closed" size={20} color={colors.error} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.limitTitle, { color: colors.text }]}>Card Limit Reached</Text>
                <Text style={[styles.limitDesc, { color: colors.textSecondary }]}>
                  You've used all 20 free cards. Upgrade to Premium for unlimited cards.
                </Text>
              </View>
            </View>
          )}

          {limitReached && !isInCollection && (
            <Pressable
              style={[styles.addBinderBtn, { backgroundColor: colors.tint }]}
              onPress={() => router.push("/upgrade")}
            >
              <Ionicons name="star" size={20} color="#FFFFFF" />
              <Text style={styles.addBinderBtnText}>Upgrade to Premium — $2.99/mo</Text>
            </Pressable>
          )}

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
            <Text style={[styles.noPriceText, { color: colors.textTertiary }]}>Pricing info for this card is hard to come by right now</Text>
          </View>
        )}

        <View style={styles.marketplaceSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Buy This Card</Text>
          <View style={styles.marketplaceGrid}>
            {getMarketplaceLinks(card).map((mp) => (
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
  addGlow: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderRadius: 12,
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
  addBinderBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  addBinderBtnText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 15,
    color: "#FFFFFF",
  },
  limitCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
  },
  limitTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
  },
  limitDesc: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    marginTop: 2,
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
    textAlign: "center",
    paddingHorizontal: 40,
  },
  notFoundBack: {
    position: "absolute",
    top: 0,
    left: 12,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  notFoundTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 20,
    marginTop: 8,
  },
  notFoundDesc: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 40,
    lineHeight: 21,
  },
  notFoundBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  notFoundBtnText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: "#FFFFFF",
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
