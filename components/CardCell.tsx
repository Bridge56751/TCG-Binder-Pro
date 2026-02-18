import React from "react";
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
  onPress: () => void;
}

export function CardCell({ cardId, localId, name, imageUrl, isCollected, onPress }: CardCellProps) {
  const { colors } = useTheme();
  const Wrapper = isCollected ? Pressable : View;
  const wrapperProps = isCollected ? { onPress, style: styles.container } : { style: styles.container };
  return (
    <Wrapper {...wrapperProps}>

      <View style={[styles.cardWrapper, { backgroundColor: colors.surface, borderColor: colors.cardBorder, ...Platform.select({ ios: { shadowColor: colors.shadow }, default: {} }) }, !isCollected && { borderColor: colors.borderLight }]}>
        {imageUrl ? (
          <>
            <Image
              source={{ uri: imageUrl }}
              style={[styles.cardImage, !isCollected && styles.grayedImage]}
              contentFit="contain"
              transition={300}
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
          <View style={[styles.collectedBadge, { backgroundColor: colors.success }]}>
            <Ionicons name="checkmark" size={10} color="#FFFFFF" />
          </View>
        )}
        {!isCollected && imageUrl && (
          <View style={styles.missingBadge}>
            <Text style={[styles.missingBadgeText, { color: colors.textTertiary }]}>#{localId}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.cardName, { color: colors.textSecondary }, !isCollected && { color: colors.textTertiary }]} numberOfLines={1}>
        {name}
      </Text>
    </Wrapper>
  );
}

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
  cardName: {
    fontFamily: "DMSans_400Regular",
    fontSize: 10,
    textAlign: "center",
    width: "100%",
  },
});
