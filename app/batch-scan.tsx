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
  Dimensions,
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
import Animated, { FadeInDown, SlideInDown } from "react-native-reanimated";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const FRAME_WIDTH = SCREEN_WIDTH - 48;
const FRAME_HEIGHT = FRAME_WIDTH * 1.4;

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
        quality: 0.9,
        base64: true,
        skipProcessing: false,
        shutterSound: false,
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
              setId,
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
        <Pressable style={[styles.closeBtn, { top: topInset + 8 }]} onPress={() => router.dismiss()} hitSlop={16}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Ionicons name="camera-outline" size={64} color={colors.textTertiary} />
        <Text style={[styles.permTitle, { color: colors.text }]}>Camera Access Needed</Text>
        <Text style={[styles.permDesc, { color: colors.textSecondary }]}>
          Batch scan requires camera access to identify your cards.
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
        autofocus="on"
        flash="off"
        zoom={0.02}
      />

      <View style={styles.dimOverlay} pointerEvents="none">
        <View style={styles.dimTop} />
        <View style={styles.dimMiddleRow}>
          <View style={styles.dimSide} />
          <View style={[styles.frameCutout, { width: FRAME_WIDTH, height: FRAME_HEIGHT }]} />
          <View style={styles.dimSide} />
        </View>
        <View style={styles.dimBottom} />
      </View>

      <View style={styles.frameOverlay} pointerEvents="none">
        <View style={[styles.frameContainer, { width: FRAME_WIDTH, height: FRAME_HEIGHT }]}>
          <View style={[styles.frameCorner, styles.cTopLeft]} />
          <View style={[styles.frameCorner, styles.cTopRight]} />
          <View style={[styles.frameCorner, styles.cBottomLeft]} />
          <View style={[styles.frameCorner, styles.cBottomRight]} />
        </View>
      </View>

      <View style={[styles.topBar, { paddingTop: topInset + 4 }]} pointerEvents="box-none">
        <Pressable style={styles.topBarBtn} onPress={() => router.dismiss()} hitSlop={16}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </Pressable>
        <View style={styles.topBarCenter} pointerEvents="none">
          <Text style={styles.topBarTitle}>Batch Scan</Text>
          {scannedCards.length > 0 ? (
            <Text style={styles.topBarCount}>
              {identifiedCount} identified{scanningCount > 0 ? ` · ${scanningCount} scanning` : ""}
            </Text>
          ) : (
            <Text style={styles.topBarCount}>Fill the frame with your card</Text>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.bottomContainer, { paddingBottom: bottomInset + 8 }]}>
        <View style={styles.captureBar}>
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

        {scannedCards.length > 0 && (
          <Animated.View entering={SlideInDown.duration(300)} style={[styles.resultsPanel, { backgroundColor: colors.background }]}>
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
                    <Text style={[styles.cardChipStatus, { color: colors.textTertiary }]}>Identifying...</Text>
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
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  dimTop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  dimMiddleRow: {
    flexDirection: "row",
  },
  dimSide: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  frameCutout: {
    backgroundColor: "transparent",
  },
  dimBottom: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  frameOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  frameContainer: {
    position: "relative",
  },
  frameCorner: {
    position: "absolute",
    width: 44,
    height: 44,
    borderColor: "#FFFFFF",
  },
  cTopLeft: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 14,
  },
  cTopRight: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 14,
  },
  cBottomLeft: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 14,
  },
  cBottomRight: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 14,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 10,
  },
  topBarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
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
  bottomContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  captureBar: {
    alignItems: "center",
    paddingVertical: 16,
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
