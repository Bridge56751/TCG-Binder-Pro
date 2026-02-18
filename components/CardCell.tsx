import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface CardCellProps {
  cardId: string;
  localId: string;
  name: string;
  imageUrl: string | null;
  isCollected: boolean;
  onPress: () => void;
}

export function CardCell({ cardId, localId, name, imageUrl, isCollected, onPress }: CardCellProps) {
  return (
    <View style={styles.container}>

      <View style={[styles.cardWrapper, !isCollected && styles.missingWrapper]}>
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
          <View style={styles.noImageContent}>
            <Ionicons
              name="image-outline"
              size={18}
              color={isCollected ? Colors.light.textTertiary : Colors.light.missingText}
            />
            <Text style={styles.noImageNumber}>#{localId}</Text>
          </View>
        )}
        {isCollected && (
          <View style={styles.collectedBadge}>
            <Ionicons name="checkmark" size={10} color="#FFFFFF" />
          </View>
        )}
        {!isCollected && imageUrl && (
          <View style={styles.missingBadge}>
            <Text style={styles.missingBadgeText}>#{localId}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.cardName, !isCollected && styles.cardNameMissing]} numberOfLines={1}>
        {name}
      </Text>
    </View>
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
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.cardBorder,
    ...Platform.select({
      ios: {
        shadowColor: Colors.light.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  missingWrapper: {
    borderColor: Colors.light.borderLight,
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
    backgroundColor: Colors.light.success,
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
    color: Colors.light.textTertiary,
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
    backgroundColor: Colors.light.missing,
  },
  noImageNumber: {
    fontFamily: "DMSans_500Medium",
    fontSize: 11,
    color: Colors.light.missingText,
  },
  cardName: {
    fontFamily: "DMSans_400Regular",
    fontSize: 10,
    color: Colors.light.textSecondary,
    textAlign: "center",
    width: "100%",
  },
  cardNameMissing: {
    color: Colors.light.textTertiary,
  },
});
