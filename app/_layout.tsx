import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
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
let requestTrackingPermissionsAsync: any = null;
let FBSettings: any = null;
if (Platform.OS !== "web") {
  try {
    requestTrackingPermissionsAsync = require("expo-tracking-transparency").requestTrackingPermissionsAsync;
  } catch {}
  try {
    const fbsdk = require("react-native-fbsdk-next");
    FBSettings = fbsdk.Settings;
  } catch {}
}

SplashScreen.preventAutoHideAsync();

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
        <Stack.Screen
          name="batch-scan"
          options={{
            headerShown: false,
            presentation: "fullScreenModal",
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

  useEffect(() => {
    if (Platform.OS === "ios" && requestTrackingPermissionsAsync) {
      (async () => {
        try {
          const { status } = await requestTrackingPermissionsAsync();
          if (FBSettings) {
            FBSettings.setAdvertiserTrackingEnabled(status === "granted");
          }
        } catch {}
      })();
    }
  }, []);

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
