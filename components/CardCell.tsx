import React from "react";
import { View, Pressable, Text, StyleSheet, Platform } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import * as Haptics from "expo-haptics";

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
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      {isCollected && imageUrl ? (
        <View style={styles.cardWrapper}>
          <Image
            source={{ uri: imageUrl }}
            style={styles.cardImage}
            contentFit="contain"
            transition={300}
          />
          <View style={styles.collectedBadge}>
            <Ionicons name="checkmark" size={10} color="#FFFFFF" />
          </View>
        </View>
      ) : (
        <View style={[styles.cardWrapper, styles.missingCard]}>
          <View style={styles.missingContent}>
            <Ionicons name="help" size={20} color={Colors.light.missingText} />
            <Text style={styles.missingNumber}>#{localId}</Text>
          </View>
        </View>
      )}
      <Text style={[styles.cardName, !isCollected && styles.cardNameMissing]} numberOfLines={1}>
        {isCollected ? name : `#${localId}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 4,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
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
  cardImage: {
    width: "100%",
    height: "100%",
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
  missingCard: {
    backgroundColor: Colors.light.missing,
    borderColor: Colors.light.borderLight,
    borderStyle: "dashed",
  },
  missingContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  missingNumber: {
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
