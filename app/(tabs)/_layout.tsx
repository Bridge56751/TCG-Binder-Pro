import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { SymbolView } from "expo-symbols";
import { Platform, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import Colors from "@/constants/colors";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "rectangle.grid.2x2", selected: "rectangle.grid.2x2.fill" }} />
        <Label>Collection</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="scan">
        <Icon sf={{ default: "camera.viewfinder", selected: "camera.viewfinder" }} />
        <Label>Scan</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="sets">
        <Icon sf={{ default: "books.vertical", selected: "books.vertical.fill" }} />
        <Label>Sets</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.light.tint,
        tabBarInactiveTintColor: Colors.light.tabIconDefault,
        headerShown: false,
        tabBarStyle: {
          position: "absolute" as const,
          backgroundColor: Platform.select({
            ios: "transparent",
            android: Colors.light.surface,
            default: Colors.light.surface,
          }),
          borderTopWidth: 0,
          elevation: 0,
          height: Platform.OS === "web" ? 84 : undefined,
          paddingBottom: Platform.OS === "web" ? 34 : undefined,
        },
        tabBarLabelStyle: {
          fontFamily: "DMSans_500Medium",
          fontSize: 11,
        },
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView intensity={100} tint="light" style={StyleSheet.absoluteFill} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Collection",
          tabBarIcon: ({ color, size }) => (
            Platform.OS === "ios" ? (
              <SymbolView name="rectangle.grid.2x2" tintColor={color} size={size} />
            ) : (
              <Ionicons name="grid" size={size} color={color} />
            )
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan",
          tabBarIcon: ({ color, size }) => (
            Platform.OS === "ios" ? (
              <SymbolView name="camera.viewfinder" tintColor={color} size={size} />
            ) : (
              <Ionicons name="scan" size={size} color={color} />
            )
          ),
        }}
      />
      <Tabs.Screen
        name="sets"
        options={{
          title: "Sets",
          tabBarIcon: ({ color, size }) => (
            Platform.OS === "ios" ? (
              <SymbolView name="books.vertical" tintColor={color} size={size} />
            ) : (
              <Ionicons name="library" size={size} color={color} />
            )
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
