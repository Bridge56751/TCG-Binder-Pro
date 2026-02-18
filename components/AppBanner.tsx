import React from "react";
import { StyleSheet, Text, View, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/ThemeContext";

export function AppBanner() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.banner, { paddingTop: topInset, backgroundColor: colors.tint }]}>
      <Text style={styles.bannerText}>TCG Binder</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingBottom: 10,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerText: {
    fontSize: 17,
    fontFamily: "DMSans_700Bold",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
});
