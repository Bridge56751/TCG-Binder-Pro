import React from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import type { GameId, TCGSet } from "@/lib/types";
import { GAMES } from "@/lib/types";
import * as Haptics from "expo-haptics";

interface SetCardProps {
  set: TCGSet;
  collectedCount: number;
  onPress: () => void;
}

export function SetCard({ set, collectedCount, onPress }: SetCardProps) {
  const game = GAMES.find((g) => g.id === set.game);
  const progress = set.totalCards > 0 ? collectedCount / set.totalCards : 0;
  const isComplete = progress >= 1;

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <View style={[styles.accentBar, { backgroundColor: game?.color || Colors.light.tint }]} />
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={1}>
              {set.name}
            </Text>
            {isComplete && (
              <Ionicons name="checkmark-circle" size={18} color={Colors.light.success} />
            )}
          </View>
          <Text style={styles.setId}>{set.id}</Text>
        </View>
        <View style={styles.footer}>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.min(progress * 100, 100)}%`,
                  backgroundColor: isComplete ? Colors.light.success : game?.color || Colors.light.tint,
                },
              ]}
            />
          </View>
          <Text style={styles.count}>
            {collectedCount}/{set.totalCards}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.light.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    marginHorizontal: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.light.cardBorder,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  accentBar: {
    width: 4,
    alignSelf: "stretch",
  },
  content: {
    flex: 1,
    padding: 14,
    gap: 10,
  },
  header: {
    gap: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  name: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: Colors.light.text,
    flex: 1,
  },
  setId: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: Colors.light.textTertiary,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  progressBarBg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.light.surfaceAlt,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  count: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: Colors.light.textSecondary,
    minWidth: 50,
    textAlign: "right",
  },
});
