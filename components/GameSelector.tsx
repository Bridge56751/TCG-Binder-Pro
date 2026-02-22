import React, { useMemo } from "react";
import { ScrollView, Pressable, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/lib/ThemeContext";
import { useCollection } from "@/lib/CollectionContext";
import type { GameId } from "@/lib/types";
import { GAMES } from "@/lib/types";
import * as Haptics from "expo-haptics";

interface GameSelectorProps {
  selected: GameId;
  onSelect: (game: GameId) => void;
}

const GAME_ICONS: Record<GameId, keyof typeof MaterialCommunityIcons.glyphMap> = {
  pokemon: "pokeball",
  yugioh: "cards",
  mtg: "magic-staff",
};

export function GameSelector({ selected, onSelect }: GameSelectorProps) {
  const { colors } = useTheme();
  const { enabledGames } = useCollection();
  const filteredGames = useMemo(() => GAMES.filter(g => enabledGames.includes(g.id)), [enabledGames]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {filteredGames.map((game) => {
        const isSelected = selected === game.id;
        return (
          <Pressable
            key={game.id}
            style={[
              styles.chip,
              { backgroundColor: colors.surfaceAlt },
              isSelected && { backgroundColor: game.color },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(game.id);
            }}
          >
            <MaterialCommunityIcons
              name={GAME_ICONS[game.id]}
              size={16}
              color={isSelected ? "#FFFFFF" : colors.textSecondary}
            />
            <Text
              style={[
                styles.chipText,
                { color: colors.textSecondary },
                isSelected && styles.chipTextSelected,
              ]}
            >
              {game.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  chipText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
});
