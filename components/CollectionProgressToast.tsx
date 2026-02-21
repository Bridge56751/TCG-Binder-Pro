import React, { useEffect } from "react";
import { View, Text, StyleSheet, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withDelay,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { useTheme } from "@/lib/ThemeContext";
import { useCollection, type ProgressToastData } from "@/lib/CollectionContext";
import type { GameId } from "@/lib/types";

function getGameColor(game: GameId, colors: any): string {
  switch (game) {
    case "pokemon": return colors.pokemon;
    case "yugioh": return colors.yugioh;
    case "onepiece": return colors.onepiece;
    case "mtg": return colors.mtg;
    default: return colors.tint;
  }
}

function ProgressContent({ data }: { data: ProgressToastData }) {
  const { colors } = useTheme();
  const gameColor = getGameColor(data.game, colors);
  const progressPercent = data.total > 0 ? Math.min(data.collected / data.total, 1) : 0;
  const isComplete = data.collected >= data.total;

  const barWidth = useSharedValue(0);
  const countScale = useSharedValue(0.5);

  useEffect(() => {
    const prevPercent = data.total > 0 ? Math.max((data.collected - 1) / data.total, 0) : 0;
    barWidth.value = prevPercent;
    barWidth.value = withDelay(200, withTiming(progressPercent, { duration: 400, easing: Easing.out(Easing.cubic) }));
    countScale.value = withSequence(
      withTiming(1.15, { duration: 150, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 150, easing: Easing.inOut(Easing.quad) })
    );
  }, [data.collected]);

  const barAnimatedStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value * 100}%`,
  }));

  const countAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: countScale.value }],
  }));

  return (
    <View style={[styles.inner, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
      <View style={styles.topRow}>
        {isComplete ? (
          <View style={[styles.iconCircle, { backgroundColor: colors.success }]}>
            <Ionicons name="trophy" size={14} color="#FFFFFF" />
          </View>
        ) : (
          <View style={[styles.iconCircle, { backgroundColor: gameColor + "20" }]}>
            <Ionicons name="albums" size={14} color={gameColor} />
          </View>
        )}
        <View style={styles.textContent}>
          <Text style={[styles.setName, { color: colors.text }]} numberOfLines={1}>
            {data.setName}
          </Text>
          <View style={styles.countRow}>
            <Animated.Text style={[styles.countText, { color: gameColor }, countAnimatedStyle]}>
              {data.collected}
            </Animated.Text>
            <Text style={[styles.totalText, { color: colors.textSecondary }]}>
              /{data.total} collected
            </Text>
          </View>
        </View>
        <Text style={[styles.percentText, { color: isComplete ? colors.success : gameColor }]}>
          {Math.round(progressPercent * 100)}%
        </Text>
      </View>
      <View style={[styles.progressBarBg, { backgroundColor: colors.surfaceAlt }]}>
        <Animated.View
          style={[
            styles.progressBarFill,
            { backgroundColor: isComplete ? colors.success : gameColor },
            barAnimatedStyle,
          ]}
        />
      </View>
    </View>
  );
}

export function CollectionProgressToast({ topOffset }: { topOffset?: number } = {}) {
  const { progressToast, clearProgressToast } = useCollection();
  const insets = useSafeAreaInsets();
  const topInset = topOffset !== undefined ? topOffset : (Platform.OS === "web" ? 67 : insets.top);
  const [visibleData, setVisibleData] = React.useState<ProgressToastData | null>(null);
  const [modalVisible, setModalVisible] = React.useState(false);

  const translateY = useSharedValue(-200);

  const dismiss = () => {
    translateY.value = withTiming(-200, { duration: 200 }, () => {
      runOnJS(clearProgressToast)();
    });
  };

  useEffect(() => {
    if (progressToast) {
      setVisibleData(progressToast);
      setModalVisible(true);
      translateY.value = -200;
      requestAnimationFrame(() => {
        translateY.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) });
      });
    } else {
      translateY.value = withTiming(-200, { duration: 250 }, () => {
        runOnJS(setModalVisible)(false);
        runOnJS(setVisibleData)(null);
      });
    }
  }, [progressToast]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!modalVisible || !visibleData) return null;

  return (
    <Animated.View
      style={[styles.container, { top: topInset + 4 }, animatedStyle]}
    >
      <Pressable onPress={dismiss}>
        <ProgressContent data={visibleData} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  inner: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
    }),
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  textContent: {
    flex: 1,
    gap: 1,
  },
  setName: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 14,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  countText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 18,
  },
  totalText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
  },
  percentText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 16,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
});
