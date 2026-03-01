import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { apiRequest } from "@/lib/query-client";
import { useCollection } from "@/lib/CollectionContext";
import { useTheme } from "@/lib/ThemeContext";
import type { GameId } from "@/lib/types";
import { addToScanHistory } from "@/lib/scan-history-storage";
import { cacheCard } from "@/lib/card-cache";
import Animated, { FadeIn, FadeInDown, SlideInDown } from "react-native-reanimated";

type ScannedCard = {
  id: string;
  status: "scanning" | "identified" | "error";
  imageUri?: string;
  name?: string;
  setName?: string;
  setId?: string;
  cardNumber?: string;
  game?: GameId;
  cardId?: string;
  verifiedCardId?: string;
  estimatedValue?: number;
  rarity?: string;
  verified?: boolean;
  apiImage?: string;
  error?: string;
  added?: boolean;
};

function gameLabel(game: GameId): string {
  if (game === "pokemon") return "Pokemon";
  if (game === "yugioh") return "Yu-Gi-Oh!";
  if (game === "mtg") return "Magic";
  return game;
}

export default function BatchScanScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { addCard } = useCollection();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [scannedCards, setScannedCards] = useState<ScannedCard[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  const captureAndIdentify = useCallback(async () => {
    if (isCapturing || !cameraRef.current) return;
    setIsCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });

      if (!photo || !photo.base64) {
        setIsCapturing(false);
        return;
      }

      const cardId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
      const newCard: ScannedCard = {
        id: cardId,
        status: "scanning",
        imageUri: photo.uri,
      };

      setScannedCards(prev => [newCard, ...prev]);
      setIsCapturing(false);

      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 100);

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        const res = await apiRequest("POST", "/api/identify-card", { image: photo.base64 }, controller.signal);
        clearTimeout(timeout);
        const data = await res.json();

        if (data.error) {
          setScannedCards(prev =>
            prev.map(c => c.id === cardId ? { ...c, status: "error" as const, error: data.error } : c)
          );
        } else {
          const setId = data.setId || "";
          const verifiedId = data.verifiedCardId || `${setId}-${data.cardNumber || ""}`;

          setScannedCards(prev =>
            prev.map(c => c.id === cardId ? {
              ...c,
              status: "identified" as const,
              name: data.englishName || data.name,
              setName: data.englishSetName || data.setName,
              setId: data.setId || "",
              cardNumber: data.cardNumber,
              game: data.game,
              cardId: verifiedId,
              verifiedCardId: data.verifiedCardId,
              estimatedValue: data.estimatedValue,
              rarity: data.rarity,
              verified: data.verified,
              apiImage: data.image,
            } : c)
          );

          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

          if (data.verified && data.game) {
            try {
              await addToScanHistory({
                ...data,
                name: data.englishName || data.name,
                setName: data.englishSetName || data.setName,
                verifiedCardId: data.verifiedCardId || verifiedId,
              }, false);
              cacheCard({
                id: verifiedId,
                localId: data.cardNumber || "",
                name: data.englishName || data.name,
                image: data.image || null,
                game: data.game,
                setId,
                setName: data.englishSetName || data.setName || "",
                rarity: data.rarity || null,
                currentPrice: data.estimatedValue,
                cachedAt: Date.now(),
              });
            } catch {}
          }
        }
      } catch (error: any) {
        setScannedCards(prev =>
          prev.map(c => c.id === cardId ? {
            ...c,
            status: "error" as const,
            error: error?.name === "AbortError" ? "Scan timed out" : "Failed to identify",
          } : c)
        );
      }
    } catch {
      setIsCapturing(false);
    }
  }, [isCapturing]);

  const handleAddCard = useCallback(async (card: ScannedCard): Promise<boolean> => {
    if (!card.game || !card.cardId || card.added || !card.setId) return false;
    try {
      await addCard(card.game, card.setId, card.cardId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScannedCards(prev =>
        prev.map(c => c.id === card.id ? { ...c, added: true } : c)
      );
      setAddedCount(prev => prev + 1);
      return true;
    } catch (err: any) {
      if (err?.message === "FREE_LIMIT" || err?.message === "GUEST_LIMIT") {
        Alert.alert("Card Limit Reached", "Upgrade to Premium for unlimited cards.");
      }
      return false;
    }
  }, [addCard]);

  const handleAddAll = useCallback(async () => {
    const cardsToAdd = scannedCards.filter(c => c.status === "identified" && !c.added && c.verified);
    if (cardsToAdd.length === 0) return;

    let added = 0;
    for (const card of cardsToAdd) {
      const success = await handleAddCard(card);
      if (success) {
        added++;
      } else {
        break;
      }
    }
    if (added > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [scannedCards, handleAddCard]);

  const removeScannedCard = useCallback((id: string) => {
    setScannedCards(prev => prev.filter(c => c.id !== id));
  }, []);

  const identifiedCount = scannedCards.filter(c => c.status === "identified").length;
  const scanningCount = scannedCards.filter(c => c.status === "scanning").length;
  const addableCount = scannedCards.filter(c => c.status === "identified" && !c.added && c.verified).length;

  if (!permission) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background, paddingTop: topInset }]}>
        <Pressable style={[styles.closeBtn, { top: topInset + 8 }]} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Ionicons name="camera-outline" size={64} color={colors.textTertiary} />
        <Text style={[styles.permTitle, { color: colors.text }]}>Camera Access Needed</Text>
        <Text style={[styles.permDesc, { color: colors.textSecondary }]}>
          Batch scan requires camera access to identify your cards in real time.
        </Text>
        <Pressable
          style={[styles.permBtn, { backgroundColor: colors.tint }]}
          onPress={() => {
            if (permission.canAskAgain) {
              requestPermission();
            } else if (Platform.OS !== "web") {
              try { Linking.openSettings(); } catch {}
            } else {
              Alert.alert("Camera Required", "Please enable camera access in your browser settings.");
            }
          }}
        >
          <Text style={styles.permBtnText}>
            {permission.canAskAgain ? "Grant Access" : "Open Settings"}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
      >
        <View style={[styles.topBar, { paddingTop: topInset + 4 }]}>
          <Pressable style={styles.topBarBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>
          <View style={styles.topBarCenter}>
            <Text style={styles.topBarTitle}>Batch Scan</Text>
            {scannedCards.length > 0 && (
              <Text style={styles.topBarCount}>
                {identifiedCount} identified{scanningCount > 0 ? ` · ${scanningCount} scanning` : ""}
              </Text>
            )}
          </View>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.crosshairOverlay}>
          <View style={styles.crosshairFrame}>
            <View style={[styles.crossCorner, styles.cTopLeft]} />
            <View style={[styles.crossCorner, styles.cTopRight]} />
            <View style={[styles.crossCorner, styles.cBottomLeft]} />
            <View style={[styles.crossCorner, styles.cBottomRight]} />
          </View>
          <Text style={styles.crosshairHint}>Hold card within frame, then tap capture</Text>
        </View>
      </CameraView>

      {scannedCards.length > 0 && (
        <Animated.View entering={SlideInDown.duration(300)} style={[styles.resultsPanel, { backgroundColor: colors.background, paddingBottom: bottomInset + 8 }]}>
          <View style={styles.resultsPanelHeader}>
            <Text style={[styles.resultsPanelTitle, { color: colors.text }]}>
              Scanned ({scannedCards.length})
            </Text>
            {addableCount > 0 && (
              <Pressable
                style={[styles.addAllBtn, { backgroundColor: colors.tint }]}
                onPress={handleAddAll}
              >
                <Ionicons name="checkmark-done" size={16} color="#FFFFFF" />
                <Text style={styles.addAllBtnText}>Add All ({addableCount})</Text>
              </Pressable>
            )}
          </View>
          <FlatList
            ref={flatListRef}
            data={scannedCards}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 12, gap: 10 }}
            renderItem={({ item }) => (
              <Animated.View entering={FadeInDown.duration(300)} style={[styles.cardChip, { backgroundColor: colors.surface, borderColor: item.added ? colors.success + "50" : colors.cardBorder }]}>
                {item.status === "scanning" ? (
                  <View style={styles.cardChipScanning}>
                    <View style={[styles.cardChipThumb, { backgroundColor: colors.surfaceAlt }]}>
                      {item.imageUri ? (
                        <Image source={{ uri: item.imageUri }} style={styles.cardChipThumbImg} contentFit="cover" />
                      ) : (
                        <ActivityIndicator size="small" color={colors.tint} />
                      )}
                    </View>
                    <ActivityIndicator size="small" color={colors.tint} style={{ marginTop: 6 }} />
                    <Text style={[styles.cardChipStatus, { color: colors.textTertiary }]}>Scanning...</Text>
                  </View>
                ) : item.status === "error" ? (
                  <View style={styles.cardChipError}>
                    <Ionicons name="alert-circle" size={24} color={colors.error} />
                    <Text style={[styles.cardChipStatus, { color: colors.error }]} numberOfLines={2}>{item.error}</Text>
                    <Pressable onPress={() => removeScannedCard(item.id)} style={[styles.chipAction, { backgroundColor: colors.error + "15" }]}>
                      <Ionicons name="trash-outline" size={14} color={colors.error} />
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.cardChipContent}>
                    <View style={[styles.cardChipThumb, { backgroundColor: colors.surfaceAlt }]}>
                      {item.apiImage ? (
                        <Image source={{ uri: item.apiImage }} style={styles.cardChipThumbImg} contentFit="cover" cachePolicy="disk" />
                      ) : (
                        <MaterialCommunityIcons name="cards-outline" size={20} color={colors.textTertiary} />
                      )}
                    </View>
                    <Text style={[styles.cardChipName, { color: colors.text }]} numberOfLines={2}>{item.name}</Text>
                    <Text style={[styles.cardChipSet, { color: colors.textTertiary }]} numberOfLines={1}>
                      {item.setName} {item.cardNumber ? `#${item.cardNumber}` : ""}
                    </Text>
                    {item.estimatedValue != null && item.estimatedValue > 0 && (
                      <Text style={[styles.cardChipPrice, { color: colors.success }]}>${item.estimatedValue.toFixed(2)}</Text>
                    )}
                    <View style={styles.cardChipRow}>
                      {item.game && (
                        <View style={[styles.chipGameBadge, { backgroundColor: colors[item.game] + "20" }]}>
                          <Text style={[styles.chipGameText, { color: colors[item.game] }]}>{gameLabel(item.game)}</Text>
                        </View>
                      )}
                      {item.verified && (
                        <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                      )}
                    </View>
                    {item.added ? (
                      <View style={[styles.chipAddedBadge, { backgroundColor: colors.success + "15" }]}>
                        <Ionicons name="checkmark" size={14} color={colors.success} />
                        <Text style={[styles.chipAddedText, { color: colors.success }]}>Added</Text>
                      </View>
                    ) : item.verified ? (
                      <Pressable
                        style={[styles.chipAddBtn, { backgroundColor: colors.tint }]}
                        onPress={() => handleAddCard(item)}
                      >
                        <Ionicons name="add" size={16} color="#FFFFFF" />
                        <Text style={styles.chipAddBtnText}>Add</Text>
                      </Pressable>
                    ) : (
                      <View style={[styles.chipAddedBadge, { backgroundColor: colors.surfaceAlt }]}>
                        <Ionicons name="help-circle-outline" size={14} color={colors.textTertiary} />
                        <Text style={[styles.chipAddedText, { color: colors.textTertiary }]}>Unverified</Text>
                      </View>
                    )}
                    <Pressable
                      onPress={() => removeScannedCard(item.id)}
                      style={[styles.chipRemoveBtn, { position: "absolute", top: 4, right: 4 }]}
                    >
                      <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                    </Pressable>
                  </View>
                )}
              </Animated.View>
            )}
          />
        </Animated.View>
      )}

      <View style={[styles.captureBar, { bottom: scannedCards.length > 0 ? 220 + bottomInset : 40 + bottomInset }]}>
        <Pressable
          style={[styles.captureBtn, isCapturing && styles.captureBtnDisabled]}
          onPress={captureAndIdentify}
          disabled={isCapturing}
        >
          {isCapturing ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <View style={styles.captureBtnInner} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 40,
  },
  camera: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  topBarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  topBarCenter: {
    flex: 1,
    alignItems: "center",
  },
  topBarTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 17,
    color: "#FFFFFF",
  },
  topBarCount: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
    marginTop: 1,
  },
  crosshairOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  crosshairFrame: {
    width: 220,
    height: 310,
  },
  crossCorner: {
    position: "absolute",
    width: 36,
    height: 36,
    borderColor: "rgba(255,255,255,0.8)",
  },
  cTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 10,
  },
  cTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 10,
  },
  cBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 10,
  },
  cBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 10,
  },
  crosshairHint: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    marginTop: 20,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  captureBar: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.5)",
  },
  captureBtnDisabled: {
    opacity: 0.6,
  },
  captureBtnInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.1)",
  },
  resultsPanel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
  },
  resultsPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  resultsPanelTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 16,
  },
  addAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  addAllBtnText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
    color: "#FFFFFF",
  },
  cardChip: {
    width: 140,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardChipScanning: {
    alignItems: "center",
    padding: 12,
    gap: 4,
    minHeight: 160,
    justifyContent: "center",
  },
  cardChipThumb: {
    width: 60,
    height: 84,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  cardChipThumbImg: {
    width: 60,
    height: 84,
    borderRadius: 8,
  },
  cardChipStatus: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    textAlign: "center",
  },
  cardChipError: {
    alignItems: "center",
    padding: 12,
    gap: 6,
    minHeight: 160,
    justifyContent: "center",
  },
  cardChipContent: {
    alignItems: "center",
    padding: 10,
    gap: 3,
  },
  cardChipName: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
  },
  cardChipSet: {
    fontFamily: "DMSans_400Regular",
    fontSize: 10,
    textAlign: "center",
  },
  cardChipPrice: {
    fontFamily: "DMSans_700Bold",
    fontSize: 14,
  },
  cardChipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  chipGameBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  chipGameText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 9,
  },
  chipAction: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  chipAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 4,
  },
  chipAddBtnText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 12,
    color: "#FFFFFF",
  },
  chipAddedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginTop: 4,
  },
  chipAddedText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 11,
  },
  chipRemoveBtn: {
    padding: 2,
  },
  closeBtn: {
    position: "absolute",
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  permTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 20,
    textAlign: "center",
  },
  permDesc: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  permBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  permBtnText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: "#FFFFFF",
  },
});
