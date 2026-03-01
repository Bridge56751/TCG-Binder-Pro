import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, Platform, Pressable } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/ThemeContext";

interface CardCellProps {
  cardId: string;
  localId: string;
  name: string;
  imageUrl: string | null;
  isCollected: boolean;
  quantity?: number;
  price?: number | null;
  selected?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

function CardCellInner({ cardId, localId, name, imageUrl, isCollected, quantity, price, selected, onPress, onLongPress }: CardCellProps) {
  const { colors } = useTheme();
  const [imageFailed, setImageFailed] = useState(false);
  const handleImageError = useCallback(() => setImageFailed(true), []);
  const showImage = imageUrl && !imageFailed;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={400} style={styles.container}>

      <View style={[styles.cardWrapper, { backgroundColor: colors.surface, borderColor: colors.cardBorder, ...Platform.select({ ios: { shadowColor: colors.shadow }, default: {} }) }, !isCollected && { borderColor: colors.borderLight }, selected && { borderColor: colors.error, borderWidth: 2 }]}>
        {showImage ? (
          <>
            <Image
              source={{ uri: imageUrl }}
              style={[styles.cardImage, !isCollected && styles.grayedImage]}
              contentFit="contain"
              transition={300}
              cachePolicy="disk"
              recyclingKey={cardId}
              onError={handleImageError}
            />
            {!isCollected && <View style={styles.grayOverlay} />}
          </>
        ) : (
          <View style={[styles.noImageContent, { backgroundColor: colors.missing }]}>
            <Ionicons
              name="image-outline"
              size={18}
              color={isCollected ? colors.textTertiary : colors.missingText}
            />
            <Text style={[styles.noImageNumber, { color: colors.missingText }]}>#{localId}</Text>
          </View>
        )}
        {isCollected && (
          <View style={[styles.collectedBadge, { backgroundColor: colors.success }, (quantity ?? 0) > 1 ? styles.collectedBadgeWide : undefined]}>
            {quantity && quantity > 1 ? (
              <Text style={styles.quantityBadgeText}>x{quantity}</Text>
            ) : (
              <Ionicons name="checkmark" size={10} color="#FFFFFF" />
            )}
          </View>
        )}
        {!isCollected && imageUrl && (
          <View style={styles.missingBadge}>
            <Text style={[styles.missingBadgeText, { color: colors.textTertiary }]}>#{localId}</Text>
          </View>
        )}
        {price != null && price > 0 && (
          <View style={[styles.priceBadge, { backgroundColor: colors.tint }]}>
            <Text style={styles.priceBadgeText}>${price < 1 ? price.toFixed(2) : price < 100 ? price.toFixed(2) : Math.round(price)}</Text>
          </View>
        )}
        {selected && (
          <View style={[styles.selectedOverlay]}>
            <View style={[styles.selectedBadge, { backgroundColor: colors.error }]}>
              <Ionicons name="checkmark" size={14} color="#FFFFFF" />
            </View>
          </View>
        )}
      </View>
      <Text style={[styles.cardName, { color: colors.textSecondary }, !isCollected && { color: colors.textTertiary }]} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}

export const CardCell = React.memo(CardCellInner);

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 4,
  },
  cardWrapper: {
    width: "100%",
    aspectRatio: 0.72,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  grayedImage: {
    opacity: 0.35,
  },
  grayOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(200, 195, 185, 0.3)",
  },
  collectedBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  collectedBadgeWide: {
    width: "auto" as any,
    paddingHorizontal: 5,
    borderRadius: 8,
    minWidth: 22,
  },
  quantityBadgeText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 9,
    color: "#FFFFFF",
  },
  missingBadge: {
    position: "absolute",
    bottom: 4,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  missingBadgeText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 10,
    backgroundColor: "rgba(255,255,255,0.85)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  noImageContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  noImageNumber: {
    fontFamily: "DMSans_500Medium",
    fontSize: 11,
  },
  priceBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    minWidth: 28,
    alignItems: "center",
  },
  priceBadgeText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 9,
    color: "#FFFFFF",
  },
  cardName: {
    fontFamily: "DMSans_400Regular",
    fontSize: 10,
    textAlign: "center",
    width: "100%",
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(220, 50, 50, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
