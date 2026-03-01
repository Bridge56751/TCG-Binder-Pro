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
import Animated, { FadeIn, FadeInDown, SlideInDown, useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing } from "react-native-reanimated";

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

const SCAN_INTERVAL = 2500;
const DUPLICATE_COOLDOWN = 15000;

export default function BatchScanScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { addCard } = useCollection();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [scannedCards, setScannedCards] = useState<ScannedCard[]>([]);
  const [addedCount, setAddedCount] = useState(0);
  const [autoScanning, setAutoScanning] = useState(true);
  const [paused, setPaused] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const isProcessingRef = useRef(false);
  const recentScansRef = useRef<Map<string, number>>(new Map());
  const autoScanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const scanLineY = useSharedValue(0);
  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanLineY.value }],
  }));

  useEffect(() => {
    scanLineY.value = withRepeat(
      withSequence(
        withTiming(260, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  const isDuplicate = useCallback((cardName: string, cardNumber: string, game: string): boolean => {
    const key = `${game}:${cardName}:${cardNumber}`.toLowerCase();
    const lastSeen = recentScansRef.current.get(key);
    if (lastSeen && Date.now() - lastSeen < DUPLICATE_COOLDOWN) {
      return true;
    }
    recentScansRef.current.set(key, Date.now());
    return false;
  }, []);

  const autoCapture = useCallback(async () => {
    if (isProcessingRef.current || !cameraRef.current || !mountedRef.current) return;
    isProcessingRef.current = true;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
        skipProcessing: false,
      });

      if (!photo || !photo.base64 || !mountedRef.current) {
        isProcessingRef.current = false;
        return;
      }

      const cardId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
      const newCard: ScannedCard = {
        id: cardId,
        status: "scanning",
      };

      setScannedCards(prev => [newCard, ...prev]);

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        const res = await apiRequest("POST", "/api/identify-card", { image: photo.base64 }, controller.signal);
        clearTimeout(timeout);
        const data = await res.json();

        if (!mountedRef.current) { isProcessingRef.current = false; return; }

        if (data.error || !data.verified || !data.game) {
          setScannedCards(prev => prev.filter(c => c.id !== cardId));
          isProcessingRef.current = false;
          return;
        }

        const cardName = data.englishName || data.name || "";
        const cardNumber = data.cardNumber || "";
        if (isDuplicate(cardName, cardNumber, data.game)) {
          setScannedCards(prev => prev.filter(c => c.id !== cardId));
          isProcessingRef.current = false;
          return;
        }

        const setId = data.setId || "";
        const verifiedId = data.verifiedCardId || `${setId}-${cardNumber}`;

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        setScannedCards(prev =>
          prev.map(c => c.id === cardId ? {
            ...c,
            status: "identified" as const,
            name: data.englishName || data.name,
            setName: data.englishSetName || data.setName,
            setId,
            cardNumber,
            game: data.game,
            cardId: verifiedId,
            verifiedCardId: data.verifiedCardId,
            estimatedValue: data.estimatedValue,
            rarity: data.rarity,
            verified: data.verified,
            apiImage: data.image,
          } : c)
        );

        setTimeout(() => {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        }, 100);

        try {
          await addToScanHistory({
            ...data,
            name: data.englishName || data.name,
            setName: data.englishSetName || data.setName,
            verifiedCardId: data.verifiedCardId || verifiedId,
          }, false);
          cacheCard({
            id: verifiedId,
            localId: cardNumber,
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
      } catch {
        if (mountedRef.current) {
          setScannedCards(prev => prev.filter(c => c.id !== cardId));
        }
      }
    } catch {}
    isProcessingRef.current = false;
  }, [isDuplicate]);

  useEffect(() => {
    if (!permission?.granted || !autoScanning || paused) {
      if (autoScanTimerRef.current) {
        clearInterval(autoScanTimerRef.current);
        autoScanTimerRef.current = null;
      }
      return;
    }

    autoScanTimerRef.current = setInterval(() => {
      autoCapture();
    }, SCAN_INTERVAL);

    return () => {
      if (autoScanTimerRef.current) {
        clearInterval(autoScanTimerRef.current);
        autoScanTimerRef.current = null;
      }
    };
  }, [permission?.granted, autoScanning, paused, autoCapture]);

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
          Auto scan requires camera access to identify your cards in real time.
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
      />

      <View style={[styles.topBar, { paddingTop: topInset + 4 }]} pointerEvents="box-none">
        <Pressable style={styles.topBarBtn} onPress={() => router.dismiss()} hitSlop={16}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </Pressable>
        <View style={styles.topBarCenter} pointerEvents="none">
          <Text style={styles.topBarTitle}>Auto Scan</Text>
          {scannedCards.length > 0 ? (
            <Text style={styles.topBarCount}>
              {identifiedCount} found{scanningCount > 0 ? ` · ${scanningCount} scanning` : ""}
            </Text>
          ) : (
            <Text style={styles.topBarCount}>Place a card in frame</Text>
          )}
        </View>
        <Pressable
          style={[styles.topBarBtn, paused && { backgroundColor: "rgba(255,80,80,0.5)" }]}
          onPress={() => { setPaused(p => !p); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          hitSlop={16}
        >
          <Ionicons name={paused ? "play" : "pause"} size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={styles.crosshairOverlay} pointerEvents="none">
        <View style={styles.crosshairFrame}>
          <View style={[styles.crossCorner, styles.cTopLeft]} />
          <View style={[styles.crossCorner, styles.cTopRight]} />
          <View style={[styles.crossCorner, styles.cBottomLeft]} />
          <View style={[styles.crossCorner, styles.cBottomRight]} />
          {!paused && (
            <Animated.View style={[styles.scanLine, scanLineStyle]} />
          )}
        </View>
        <View style={styles.statusRow}>
          {paused ? (
            <View style={styles.statusBadgePaused}>
              <Ionicons name="pause-circle" size={14} color="#FF6B6B" />
              <Text style={styles.statusTextPaused}>Paused</Text>
            </View>
          ) : scanningCount > 0 ? (
            <View style={styles.statusBadgeScanning}>
              <ActivityIndicator size={10} color="#FFFFFF" />
              <Text style={styles.statusTextActive}>Identifying...</Text>
            </View>
          ) : (
            <View style={styles.statusBadgeActive}>
              <View style={styles.pulseDot} />
              <Text style={styles.statusTextActive}>Scanning</Text>
            </View>
          )}
        </View>
      </View>

      {scannedCards.length > 0 && (
        <Animated.View entering={SlideInDown.duration(300)} style={[styles.resultsPanel, { backgroundColor: colors.background, paddingBottom: bottomInset + 8 }]}>
          <View style={styles.resultsPanelHeader}>
            <Text style={[styles.resultsPanelTitle, { color: colors.text }]}>
              Scanned ({identifiedCount})
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
            data={scannedCards.filter(c => c.status !== "scanning")}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 12, gap: 10 }}
            renderItem={({ item }) => (
              <Animated.View entering={FadeInDown.duration(300)} style={[styles.cardChip, { backgroundColor: colors.surface, borderColor: item.added ? colors.success + "50" : colors.cardBorder }]}>
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
              </Animated.View>
            )}
          />
        </Animated.View>
      )}
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
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: "rgba(0,0,0,0.3)",
    zIndex: 10,
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
    overflow: "hidden",
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
  scanLine: {
    position: "absolute",
    left: 8,
    right: 8,
    height: 2,
    backgroundColor: "rgba(0,200,120,0.7)",
    borderRadius: 1,
    shadowColor: "#00C878",
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  statusRow: {
    marginTop: 16,
  },
  statusBadgeActive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,200,120,0.25)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusBadgeScanning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusBadgePaused: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,80,80,0.25)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusTextActive: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 12,
    color: "#FFFFFF",
  },
  statusTextPaused: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 12,
    color: "#FF6B6B",
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#00C878",
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
  cardChipContent: {
    alignItems: "center",
    padding: 10,
    gap: 3,
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
