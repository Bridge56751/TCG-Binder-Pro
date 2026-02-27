import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { CollectionProvider } from "@/lib/CollectionContext";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { PurchaseProvider } from "@/lib/PurchaseContext";
import { ThemeProvider, useTheme } from "@/lib/ThemeContext";
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from "@expo-google-fonts/dm-sans";
import { StatusBar } from "expo-status-bar";
import { GalleryProvider } from "@/lib/GalleryContext";
import { Platform } from "react-native";

SplashScreen.preventAutoHideAsync();

let FBSettings: any = null;
if (Platform.OS !== "web") {
  try {
    FBSettings = require("react-native-fbsdk-next").Settings;
  } catch {}
}

function useTrackingTransparency() {
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    (async () => {
      try {
        const { requestTrackingPermissionsAsync } = require("expo-tracking-transparency");
        const { status } = await requestTrackingPermissionsAsync();
        if (status === "granted" && FBSettings) {
          FBSettings.setAdvertiserTrackingEnabled(true);
        }
      } catch {}
    })();
  }, []);
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

function useProtectedRoute() {
  const { user, isGuest, loading, needsVerification } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthScreen = segments[0] === "auth";
    const inUpgradeScreen = segments[0] === "upgrade";

    if (!user && !isGuest && !inAuthScreen && !inUpgradeScreen) {
      router.replace("/auth");
    } else if (user && needsVerification && !inAuthScreen) {
      router.replace("/auth");
    } else if (user && !needsVerification && inAuthScreen) {
      router.replace("/(tabs)");
    }
  }, [user, isGuest, loading, needsVerification, segments]);
}


function RootLayoutNav() {
  const { loading } = useAuth();
  const { colors } = useTheme();
  useProtectedRoute();
  useTrackingTransparency();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerBackTitle: "Back" }}>
        <Stack.Screen name="auth" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="set/[game]/[id]"
          options={{
            headerShown: false,
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="card/[game]/[cardId]"
          options={{
            headerShown: false,
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="all-cards"
          options={{
            headerShown: false,
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="stats"
          options={{
            headerShown: false,
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="upgrade"
          options={{
            headerShown: false,
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="legal"
          options={{
            headerShown: false,
            presentation: "card",
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView>
          <KeyboardProvider>
            <AuthProvider>
              <PurchaseProvider>
                <CollectionProvider>
                  <ThemeProvider>
                    <GalleryProvider>
                      <ThemedStatusBar />
                      <RootLayoutNav />
                    </GalleryProvider>
                  </ThemeProvider>
                </CollectionProvider>
              </PurchaseProvider>
            </AuthProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
