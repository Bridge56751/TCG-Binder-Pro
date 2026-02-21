import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useCallback } from "react";
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
import { CollectionProgressToast } from "@/components/CollectionProgressToast";
import { GalleryProvider, useGallery } from "@/lib/GalleryContext";
import { CardGallery } from "@/components/CardGallery";

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

function GalleryOverlay() {
  const { gallery, closeGallery, gameIdRef } = useGallery();
  const handleClose = useCallback((lastIndex: number) => {
    const lastCard = gallery.cards[lastIndex];
    closeGallery(lastIndex);
    if (lastCard) {
      const game = gameIdRef.current;
      if (game && lastCard.id) {
        setTimeout(() => {
          router.replace(`/card/${game}/${lastCard.id}`);
        }, 100);
      }
    }
  }, [gallery.cards, closeGallery, gameIdRef]);

  return (
    <CardGallery
      visible={gallery.visible}
      cards={gallery.cards}
      initialIndex={gallery.initialIndex}
      onClose={handleClose}
    />
  );
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
      <CollectionProgressToast />
      <GalleryOverlay />
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
