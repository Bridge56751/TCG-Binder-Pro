import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface StatCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color?: string;
}

export function StatCard({ icon, label, value, color = Colors.light.tint }: StatCardProps) {
  return (
    <View style={styles.container}>
      <View style={[styles.iconWrapper, { backgroundColor: color + "15" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.light.cardBorder,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontFamily: "DMSans_700Bold",
    fontSize: 20,
    color: Colors.light.text,
  },
  label: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: Colors.light.textSecondary,
  },
});
