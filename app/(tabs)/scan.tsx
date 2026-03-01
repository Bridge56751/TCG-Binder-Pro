import React, { useState, useCallback, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { apiRequest } from "@/lib/query-client";
import { useCollection } from "@/lib/CollectionContext";
import { useTheme } from "@/lib/ThemeContext";
import type { CardIdentification, CardAlternative, GameId } from "@/lib/types";
import { makeFoilCardId } from "@/lib/types";
import {
  addToScanHistory,
} from "@/lib/scan-history-storage";
import { cacheCard } from "@/lib/card-cache";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  SlideInUp,
  SlideOutUp,
} from "react-native-reanimated";

const SCAN_IMG_SIZES = {
  large: { width: 160, height: 224, borderRadius: 10, marginBottom: 10, iconSize: 48 },
  medium: { width: 50, height: 70, borderRadius: 6, marginBottom: 0, iconSize: 20 },
  small: { width: 44, height: 62, borderRadius: 6, marginBottom: 0, iconSize: 18 },
} as const;

function ScanResultImage({ uri, size, colors }: { uri: string | null; size: keyof typeof SCAN_IMG_SIZES; colors: any }) {
  const [failed, setFailed] = useState(false);
  const s = SCAN_IMG_SIZES[size];
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={{ width: s.width, height: s.height, borderRadius: s.borderRadius, marginBottom: s.marginBottom }}
        contentFit={size === "large" ? "contain" : "cover"}
        cachePolicy="disk"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={{ width: s.width, height: s.height, borderRadius: s.borderRadius, marginBottom: s.marginBottom, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
      <MaterialCommunityIcons name="cards-outline" size={s.iconSize} color={colors.textTertiary} />
    </View>
  );
}

function gameLabel(game: GameId): string {
  if (game === "pokemon") return "Pokemon";
  if (game === "yugioh") return "Yu-Gi-Oh!";
  if (game === "mtg") return "Magic";
  return game;
}

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<CardIdentification | null>(null);
  const { addCard, hasCard, cardQuantity } = useCollection();

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addQuantity, setAddQuantity] = useState(1);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCardNumber, setEditCardNumber] = useState("");
  const [editSetName, setEditSetName] = useState("");
  const [editGame, setEditGame] = useState<GameId>("pokemon");
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [confirmedResult, setConfirmedResult] = useState<CardIdentification | null>(null);
  const [isFoil, setIsFoil] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const scrollToFocusedInput = useCallback(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 350);
  }, []);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 84 + 34 : 100;

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(msg);
    toastTimer.current = setTimeout(() => {
      setToastMessage(null);
    }, 2000);
  }, []);

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Camera Access Required",
        "TCG Binder needs camera access to scan your trading cards. Please enable it in your device settings.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setScanResult(null);
      setConfirmedResult(null);
      setIsEditing(false);
      setAddQuantity(1);
      identifyCard(result.assets[0].base64!);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Photo Library Access Required",
        "TCG Binder needs access to your photo library to select card images for scanning. Please enable it in your device settings.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setScanResult(null);
      setConfirmedResult(null);
      setIsEditing(false);
      setAddQuantity(1);
      identifyCard(result.assets[0].base64!);
    }
  };

  const identifyCard = async (base64: string) => {
    setIsScanning(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const res = await apiRequest("POST", "/api/identify-card", { image: base64 }, controller.signal);
      clearTimeout(timeout);
      const data: CardIdentification = await res.json();
      if (data.error) {
        Alert.alert("Could not identify", data.error);
        setScanResult(null);
      } else {
        setScanResult(data);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error: any) {
      if (error?.name === "AbortError") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert(
          "Taking too long",
          "The scan is taking longer than expected. Try taking a clearer photo with good lighting.",
          [{ text: "Retake Photo", onPress: resetScan }]
        );
      } else {
        Alert.alert("Error", "Failed to identify the card. Please try again.");
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddToCollection = async () => {
    const activeResult = confirmedResult || scanResult;
    if (!activeResult) return;
    let cardId = activeResult.verifiedCardId || `${activeResult.setId}-${activeResult.cardNumber}`;
    if (isFoil && activeResult.game === "mtg") {
      cardId = makeFoilCardId(cardId);
    }
    try {
      await addCard(
        activeResult.game,
        activeResult.setId,
        cardId,
        addQuantity
      );
    } catch (err: any) {
      if (err?.message === "FREE_LIMIT" || err?.message === "GUEST_LIMIT") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        router.push("/upgrade");
        return;
      }
      throw err;
    }
    await addToScanHistory(activeResult, true);
    cacheCard({
      id: activeResult.verifiedCardId || `${activeResult.setId}-${activeResult.cardNumber}`,
      localId: activeResult.cardNumber,
      name: activeResult.name,
      englishName: activeResult.englishName,
      image: null,
      game: activeResult.game,
      setId: activeResult.setId,
      setName: activeResult.setName,
      rarity: activeResult.rarity,
      currentPrice: activeResult.estimatedValue,
      cachedAt: Date.now(),
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const qtyLabel = addQuantity > 1 ? `${addQuantity} copies of ` : "";

    Alert.alert(
      "Added!",
      `${qtyLabel}${activeResult.name} has been added to your collection.`,
      [
        { text: "Scan Another", onPress: resetScan },
        {
          text: "View Set",
          onPress: () =>
            router.push({
              pathname: "/set/[game]/[id]",
              params: { game: activeResult.game, id: activeResult.setId, lang: activeResult.language || "en" },
            }),
        },
      ]
    );
  };

  const resetScan = () => {
    setImageUri(null);
    setScanResult(null);
    setConfirmedResult(null);
    setIsScanning(false);
    setAddQuantity(1);
    setIsFoil(false);
    setIsEditing(false);
    setEditName("");
    setEditCardNumber("");
    setEditSetName("");
    setSearchResults([]);
    setHasSearched(false);
  };

  const confirmMainPick = () => {
    if (!scanResult) return;
    setConfirmedResult(scanResult);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const confirmAlternative = (alt: CardAlternative) => {
    if (!scanResult) return;
    const altResult: CardIdentification = {
      game: alt.game,
      name: alt.name,
      setName: alt.setName,
      setId: alt.setId,
      cardNumber: alt.localId,
      rarity: alt.rarity || "",
      estimatedValue: scanResult.estimatedValue || 0,
      verified: true,
      verifiedCardId: alt.cardId,
      language: scanResult.language || "en",
    };
    setConfirmedResult(altResult);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const startEditing = () => {
    if (!scanResult) return;
    setEditName(scanResult.englishName || scanResult.name || "");
    setEditCardNumber(scanResult.cardNumber || "");
    setEditSetName("");
    setEditGame(scanResult.game);
    setSearchResults([]);
    setHasSearched(false);
    setIsEditing(true);
  };

  const searchCards = async () => {
    if (!editName.trim() && !editCardNumber.trim()) return;
    setIsCorrecting(true);
    setSearchResults([]);
    setHasSearched(false);
    try {
      const res = await apiRequest("POST", "/api/search-cards", {
        game: editGame,
        query: editName.trim() || undefined,
        setName: editSetName.trim() || undefined,
        cardNumber: editCardNumber.trim() || undefined,
      });
      const data = await res.json();
      setSearchResults(data.results || []);
      setHasSearched(true);
      if (!data.results || data.results.length === 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to search for cards. Please try again.");
    } finally {
      setIsCorrecting(false);
    }
  };

  const selectSearchResult = async (result: any) => {
    const corrected: CardIdentification = {
      game: result.game,
      name: result.name,
      setId: result.setId,
      setName: result.setName,
      cardNumber: result.localId || "",
      verified: true,
      verifiedCardId: result.cardId,
      rarity: result.rarity || scanResult?.rarity || "",
      estimatedValue: scanResult?.estimatedValue || 0,
      language: "en",
    };
    const cardId = corrected.verifiedCardId || `${corrected.setId}-${corrected.cardNumber}`;
    try {
      await addCard(corrected.game, corrected.setId, cardId, addQuantity);
    } catch (err: any) {
      if (err?.message === "FREE_LIMIT" || err?.message === "GUEST_LIMIT") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        router.push("/upgrade");
        return;
      }
    }
    await addToScanHistory(corrected, true);
    cacheCard({
      id: cardId,
      localId: corrected.cardNumber,
      name: corrected.name,
      image: result.image || null,
      game: corrected.game,
      setId: corrected.setId,
      setName: corrected.setName,
      rarity: corrected.rarity,
      cachedAt: Date.now(),
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSearchResults([]);
    setHasSearched(false);
    setIsEditing(false);

    const qtyLabel = addQuantity > 1 ? `${addQuantity} copies of ` : "";
    setScanResult(null);
    resetScan();
    showToast(`${qtyLabel}${corrected.name} added to collection!`);
  };

  const dynamicStyles = getDynamicStyles(colors);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
    <ScrollView
      ref={scrollViewRef}
      style={[dynamicStyles.container, { paddingTop: topInset }]}
      contentContainerStyle={{ paddingBottom: bottomInset + 40 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {toastMessage && (
        <Animated.View
          entering={SlideInUp.duration(300)}
          exiting={SlideOutUp.duration(300)}
          style={[dynamicStyles.toast, { top: topInset + 4 }]}
        >
          <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
          <Text style={dynamicStyles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}

      {imageUri ? (
        <>
          <View style={dynamicStyles.header}>
            <Text style={dynamicStyles.title}>Scan Card</Text>
          </View>
          <View style={dynamicStyles.scanArea}>
            <Animated.View entering={FadeIn.duration(300)} style={[dynamicStyles.previewWrapper, { backgroundColor: colors.surfaceAlt }]}>
              <Image source={{ uri: imageUri }} style={dynamicStyles.preview} contentFit="contain" />
              {isScanning && (
                <View style={[dynamicStyles.scanningOverlay, { backgroundColor: colors.background + "DD" }]}>
                  <ActivityIndicator size="large" color={colors.tint} />
                  <Text style={[dynamicStyles.scanningText, { color: colors.text }]}>Identifying card...</Text>
                </View>
              )}
              <Pressable style={dynamicStyles.clearButton} onPress={resetScan}>
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </Pressable>
            </Animated.View>
          </View>
        </>
      ) : (
        <Animated.View entering={FadeIn.duration(300)} style={dynamicStyles.emptyState}>
          <Pressable
            style={({ pressed }) => [dynamicStyles.scanHeroBtn, { backgroundColor: colors.tint, opacity: pressed ? 0.9 : 1 }]}
            onPress={takePhoto}
          >
            <View style={dynamicStyles.scanHeroIcon}>
              <Ionicons name="camera" size={44} color="#FFFFFF" />
            </View>
            <Text style={dynamicStyles.scanHeroTitle}>Scan a Card</Text>
            <Text style={dynamicStyles.scanHeroSub}>Take a photo to identify it instantly</Text>
          </Pressable>

          <View style={dynamicStyles.scanOptions}>
            <Pressable
              style={({ pressed }) => [dynamicStyles.scanOptionBtn, { backgroundColor: colors.surface, borderColor: colors.cardBorder, opacity: pressed ? 0.8 : 1 }]}
              onPress={pickImage}
            >
              <View style={[dynamicStyles.scanOptionIcon, { backgroundColor: colors.tint + "15" }]}>
                <Ionicons name="images" size={22} color={colors.tint} />
              </View>
              <Text style={[dynamicStyles.scanOptionLabel, { color: colors.text }]}>Photo Library</Text>
              <Text style={[dynamicStyles.scanOptionDesc, { color: colors.textTertiary }]}>Pick from saved photos</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [dynamicStyles.scanOptionBtn, { backgroundColor: colors.surface, borderColor: colors.cardBorder, opacity: pressed ? 0.8 : 1 }]}
              onPress={() => {
                router.push("/batch-scan");
              }}
            >
              <View style={[dynamicStyles.scanOptionIcon, { backgroundColor: colors.tint + "15" }]}>
                <MaterialCommunityIcons name="cards-outline" size={22} color={colors.tint} />
              </View>
              <Text style={[dynamicStyles.scanOptionLabel, { color: colors.text }]}>Batch Scan</Text>
              <Text style={[dynamicStyles.scanOptionDesc, { color: colors.textTertiary }]}>Scan multiple cards</Text>
            </Pressable>
          </View>

          <View style={dynamicStyles.scanTips}>
            <Text style={[dynamicStyles.scanTipsTitle, { color: colors.textSecondary }]}>Tips for best results</Text>
            <View style={dynamicStyles.scanTipRow}>
              <Ionicons name="sunny-outline" size={16} color={colors.textTertiary} />
              <Text style={[dynamicStyles.scanTipText, { color: colors.textTertiary }]}>Use good lighting, avoid glare</Text>
            </View>
            <View style={dynamicStyles.scanTipRow}>
              <Ionicons name="scan-outline" size={16} color={colors.textTertiary} />
              <Text style={[dynamicStyles.scanTipText, { color: colors.textTertiary }]}>Fill the frame with the card</Text>
            </View>
            <View style={dynamicStyles.scanTipRow}>
              <Ionicons name="hand-left-outline" size={16} color={colors.textTertiary} />
              <Text style={[dynamicStyles.scanTipText, { color: colors.textTertiary }]}>Hold steady for a clear shot</Text>
            </View>
          </View>
        </Animated.View>
      )}

      {scanResult && !confirmedResult && !isEditing && (() => {
        const alternatives = scanResult.alternatives || [];
        const hasAlts = alternatives.length > 0;
        return (
        <Animated.View entering={FadeInDown.duration(400).springify()} style={[dynamicStyles.resultCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Ionicons name="sparkles" size={18} color={colors.tint} />
            <Text style={{ fontFamily: "DMSans_700Bold", fontSize: 16, color: colors.text }}>
              {scanResult.verified ? "Match Found" : "Best Guess"}
            </Text>
          </View>
          <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 13, color: colors.textSecondary, marginBottom: 8 }}>
            Tap the correct card to confirm
          </Text>

          <Pressable
            style={({ pressed }) => ({
              padding: 12,
              borderRadius: 14,
              backgroundColor: pressed ? colors.tint + "12" : colors.tint + "08",
              borderWidth: 2,
              borderColor: colors.tint + "40",
              alignItems: "center" as const,
            })}
            onPress={confirmMainPick}
          >
            <ScanResultImage uri={scanResult.image ?? null} size="large" colors={colors} />
            
            <Text style={{ fontFamily: "DMSans_700Bold", fontSize: 17, color: colors.text, textAlign: "center" }} numberOfLines={2}>
              {scanResult.englishName || scanResult.name}
            </Text>
            <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 13, color: colors.textSecondary, textAlign: "center", marginTop: 2 }} numberOfLines={1}>
              {scanResult.englishSetName || scanResult.setName} #{scanResult.cardNumber}
            </Text>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap", justifyContent: "center" }}>
              <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: colors[scanResult.game] + "20" }}>
                <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 10, color: colors[scanResult.game] }}>
                  {gameLabel(scanResult.game)}
                </Text>
              </View>
              {scanResult.rarity ? (
                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: colors.surfaceAlt }}>
                  <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 10, color: colors.textTertiary }}>{scanResult.rarity}</Text>
                </View>
              ) : null}
              {scanResult.verified && (
                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: colors.success + "18" }}>
                  <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 10, color: colors.success }}>Verified</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 }}>
              <Ionicons name="checkmark-circle" size={18} color={colors.tint} />
              <Text style={{ fontFamily: "DMSans_600SemiBold", fontSize: 13, color: colors.tint }}>Tap to confirm</Text>
            </View>
          </Pressable>

          {hasAlts && (
            <View style={{ gap: 8, marginTop: 12 }}>
              <Text style={{ fontFamily: "DMSans_600SemiBold", fontSize: 13, color: colors.textSecondary }}>
                Other possible matches
              </Text>
              {alternatives.map((alt, idx) => (
                <Pressable
                  key={`${alt.cardId}-${idx}`}
                  style={({ pressed }) => ({
                    flexDirection: "row" as const,
                    gap: 10,
                    padding: 10,
                    borderRadius: 10,
                    backgroundColor: pressed ? colors.tint + "10" : colors.surfaceAlt,
                    borderWidth: 1,
                    borderColor: pressed ? colors.tint + "30" : colors.cardBorder,
                  })}
                  onPress={() => confirmAlternative(alt)}
                >
                  <ScanResultImage uri={alt.image} size="small" colors={colors} />
                  
                  <View style={{ flex: 1, justifyContent: "center", gap: 2 }}>
                    <Text style={{ fontFamily: "DMSans_600SemiBold", fontSize: 14, color: colors.text }} numberOfLines={1}>
                      {alt.name}
                    </Text>
                    <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.textSecondary }} numberOfLines={1}>
                      {alt.setName}{alt.localId ? ` #${alt.localId}` : ""}
                    </Text>
                  </View>
                  <View style={{ justifyContent: "center" }}>
                    <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable
              style={({ pressed }) => ({
                flex: 1,
                flexDirection: "row" as const,
                alignItems: "center" as const,
                justifyContent: "center" as const,
                gap: 6,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: colors.surfaceAlt,
                opacity: pressed ? 0.7 : 1,
              })}
              onPress={() => { setIsEditing(true); startEditing(); }}
            >
              <Ionicons name="pencil" size={14} color={colors.textSecondary} />
              <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.textSecondary }}>Search Manually</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => ({
                flex: 1,
                flexDirection: "row" as const,
                alignItems: "center" as const,
                justifyContent: "center" as const,
                gap: 6,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: colors.surfaceAlt,
                opacity: pressed ? 0.7 : 1,
              })}
              onPress={resetScan}
            >
              <Ionicons name="camera-reverse" size={14} color={colors.textSecondary} />
              <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.textSecondary }}>Rescan</Text>
            </Pressable>
          </View>
        </Animated.View>
        );
      })()}

      {confirmedResult && (() => {
        const activeResult = confirmedResult;
        const baseCardId = activeResult.verifiedCardId || `${activeResult.setId}-${activeResult.cardNumber}`;
        const cardId = (isFoil && activeResult.game === "mtg") ? makeFoilCardId(baseCardId) : baseCardId;
        const alreadyOwned = hasCard(activeResult.game, activeResult.setId, cardId);
        const ownedQty = alreadyOwned ? cardQuantity(activeResult.game, activeResult.setId, cardId) : 0;
        return (
        <Animated.View entering={FadeInDown.duration(300).springify()} style={[dynamicStyles.resultCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <View style={{ alignItems: "center", gap: 4, paddingBottom: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={{ fontFamily: "DMSans_600SemiBold", fontSize: 14, color: colors.success }}>Card Selected</Text>
            </View>
            <Text style={{ fontFamily: "DMSans_700Bold", fontSize: 20, color: colors.text, textAlign: "center" }} numberOfLines={2}>
              {activeResult.englishName || activeResult.name}
            </Text>
            {activeResult.englishName && activeResult.englishName !== activeResult.name && (
              <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 13, color: colors.textTertiary, textAlign: "center" }}>
                {activeResult.name}
              </Text>
            )}
            <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 14, color: colors.textSecondary, textAlign: "center", marginTop: 1 }}>
              {activeResult.englishSetName || activeResult.setName} #{activeResult.cardNumber}
            </Text>
            {activeResult.estimatedValue != null && activeResult.estimatedValue > 0 && (
              <Text style={{ fontFamily: "DMSans_700Bold", fontSize: 28, color: colors.success, textAlign: "center", marginTop: 8 }}>
                ${activeResult.estimatedValue.toFixed(2)}
              </Text>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap", justifyContent: "center" }}>
              <View style={[dynamicStyles.badge, { backgroundColor: colors[activeResult.game] + "20", flexDirection: "row", alignItems: "center", gap: 4 }]}>
                <Text style={[dynamicStyles.badgeText, { color: colors[activeResult.game] }]}>
                  {gameLabel(activeResult.game)}
                </Text>
              </View>
              {activeResult.rarity ? (
                <View style={[dynamicStyles.badge, { backgroundColor: colors.surfaceAlt }]}>
                  <Text style={[dynamicStyles.badgeText, { color: colors.textSecondary }]}>
                    {activeResult.rarity}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={{ height: 1, backgroundColor: colors.cardBorder, marginVertical: 6 }} />

          {activeResult.game === "mtg" && (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 0, marginVertical: 4 }}>
              <Pressable
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  borderTopRightRadius: 0,
                  borderBottomRightRadius: 0,
                  alignItems: "center" as const,
                  backgroundColor: !isFoil ? colors.tint : colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: !isFoil ? colors.tint : colors.cardBorder,
                }}
                onPress={() => { setIsFoil(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Text style={{ fontFamily: "DMSans_600SemiBold", fontSize: 13, color: !isFoil ? "#FFFFFF" : colors.textSecondary }}>Normal</Text>
              </Pressable>
              <Pressable
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
                  alignItems: "center" as const,
                  flexDirection: "row" as const,
                  justifyContent: "center" as const,
                  gap: 5,
                  backgroundColor: isFoil ? "#9B59B6" : colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: isFoil ? "#9B59B6" : colors.cardBorder,
                  borderLeftWidth: 0,
                }}
                onPress={() => { setIsFoil(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Ionicons name="sparkles" size={14} color={isFoil ? "#FFFFFF" : colors.textSecondary} />
                <Text style={{ fontFamily: "DMSans_600SemiBold", fontSize: 13, color: isFoil ? "#FFFFFF" : colors.textSecondary }}>Foil</Text>
              </Pressable>
            </View>
          )}

          {alreadyOwned && (
            <View style={[dynamicStyles.ownedBanner, { backgroundColor: colors.tint + "10" }]}>
              <Ionicons name="layers" size={16} color={colors.tint} />
              <Text style={[dynamicStyles.ownedBannerText, { color: colors.tint }]}>
                You already own {ownedQty}
              </Text>
            </View>
          )}

          <View style={dynamicStyles.quantityRow}>
            <Text style={[dynamicStyles.quantityLabel, { color: colors.textSecondary }]}>
              {alreadyOwned ? "Add more" : "Quantity"}
            </Text>
            <View style={dynamicStyles.quantityStepper}>
              <Pressable
                style={[dynamicStyles.stepperButton, { backgroundColor: colors.surfaceAlt }]}
                onPress={() => setAddQuantity((q) => Math.max(1, q - 1))}
              >
                <Ionicons name="remove" size={18} color={addQuantity <= 1 ? colors.textTertiary : colors.text} />
              </Pressable>
              <Text style={[dynamicStyles.quantityValue, { color: colors.text }]}>{addQuantity}</Text>
              <Pressable
                style={[dynamicStyles.stepperButton, { backgroundColor: colors.surfaceAlt }]}
                onPress={() => setAddQuantity((q) => Math.min(99, q + 1))}
              >
                <Ionicons name="add" size={18} color={colors.text} />
              </Pressable>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [dynamicStyles.addButton, { backgroundColor: colors.tint }, pressed && { opacity: 0.9 }]}
            onPress={handleAddToCollection}
          >
            <Ionicons name={alreadyOwned ? "duplicate" : "add-circle"} size={20} color="#FFFFFF" />
            <Text style={dynamicStyles.addButtonText}>
              {alreadyOwned
                ? `Add ${addQuantity} More${isFoil && activeResult.game === "mtg" ? " (Foil)" : ""}`
                : addQuantity > 1
                  ? `Add ${addQuantity}${isFoil && activeResult.game === "mtg" ? " Foil" : ""} to Collection`
                  : isFoil && activeResult.game === "mtg" ? "Add Foil to Collection" : "Add to Collection"}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => ({
              flexDirection: "row" as const,
              alignItems: "center" as const,
              justifyContent: "center" as const,
              gap: 6,
              paddingVertical: 6,
              opacity: pressed ? 0.6 : 1,
            })}
            onPress={() => { setConfirmedResult(null); setAddQuantity(1); }}
          >
            <Ionicons name="arrow-back" size={14} color={colors.textTertiary} />
            <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.textTertiary }}>Back to matches</Text>
          </Pressable>
        </Animated.View>
        );
      })()}

      {scanResult && isEditing && (() => {
        return (
        <Animated.View entering={FadeInDown.duration(400).springify()} style={[dynamicStyles.resultCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <View style={{ gap: 12 }}>
              <View style={{ backgroundColor: colors.tint + "10", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="search" size={16} color={colors.tint} />
                <Text style={{ fontFamily: "DMSans_600SemiBold", fontSize: 13, color: colors.tint }}>Search for the correct card</Text>
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.textSecondary }}>Game</Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {(["pokemon", "yugioh", "mtg"] as GameId[]).map((g) => (
                    <Pressable
                      key={g}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 8,
                        alignItems: "center" as const,
                        backgroundColor: editGame === g ? colors.tint : colors.surfaceAlt,
                        borderWidth: 1,
                        borderColor: editGame === g ? colors.tint : colors.cardBorder,
                      }}
                      onPress={() => { setEditGame(g); setSearchResults([]); setHasSearched(false); }}
                    >
                      <Text style={{ fontFamily: "DMSans_600SemiBold", fontSize: 11, color: editGame === g ? "#FFFFFF" : colors.textSecondary }}>
                        {gameLabel(g)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.textSecondary }}>Card Name</Text>
                <TextInput
                  style={{
                    fontFamily: "DMSans_400Regular",
                    fontSize: 15,
                    color: colors.text,
                    backgroundColor: colors.surfaceAlt,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.cardBorder,
                  }}
                  value={editName}
                  onChangeText={(t) => { setEditName(t); setHasSearched(false); }}
                  placeholder="Enter card name"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="words"
                  returnKeyType="search"
                  onSubmitEditing={searchCards}
                  onFocus={scrollToFocusedInput}
                />
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.textSecondary }}>Card Number</Text>
                <TextInput
                  style={{
                    fontFamily: "DMSans_400Regular",
                    fontSize: 15,
                    color: colors.text,
                    backgroundColor: colors.surfaceAlt,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.cardBorder,
                  }}
                  value={editCardNumber}
                  onChangeText={(t) => { setEditCardNumber(t); setHasSearched(false); }}
                  placeholder="e.g. 022/132 or 022"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  returnKeyType="search"
                  onSubmitEditing={searchCards}
                  onFocus={scrollToFocusedInput}
                />
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.textSecondary }}>Set Name (optional)</Text>
                <TextInput
                  style={{
                    fontFamily: "DMSans_400Regular",
                    fontSize: 15,
                    color: colors.text,
                    backgroundColor: colors.surfaceAlt,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.cardBorder,
                  }}
                  value={editSetName}
                  onChangeText={(t) => { setEditSetName(t); setHasSearched(false); }}
                  placeholder="e.g. Prismatic Evolutions, Scarlet & Violet"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="words"
                  returnKeyType="search"
                  onSubmitEditing={searchCards}
                  onFocus={scrollToFocusedInput}
                />
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  style={({ pressed }) => ({
                    flex: 1,
                    flexDirection: "row" as const,
                    alignItems: "center" as const,
                    justifyContent: "center" as const,
                    gap: 6,
                    paddingVertical: 12,
                    borderRadius: 10,
                    backgroundColor: colors.surfaceAlt,
                    opacity: pressed ? 0.8 : 1,
                  })}
                  onPress={() => { setIsEditing(false); setSearchResults([]); setHasSearched(false); }}
                >
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                  <Text style={{ fontFamily: "DMSans_600SemiBold", fontSize: 14, color: colors.textSecondary }}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => ({
                    flex: 2,
                    flexDirection: "row" as const,
                    alignItems: "center" as const,
                    justifyContent: "center" as const,
                    gap: 6,
                    paddingVertical: 12,
                    borderRadius: 10,
                    backgroundColor: colors.tint,
                    opacity: (pressed ? 0.9 : 1) * ((!editName.trim() && !editCardNumber.trim()) || isCorrecting ? 0.6 : 1),
                  })}
                  onPress={searchCards}
                  disabled={isCorrecting || (!editName.trim() && !editCardNumber.trim())}
                >
                  {isCorrecting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="search" size={18} color="#FFFFFF" />
                  )}
                  <Text style={{ fontFamily: "DMSans_600SemiBold", fontSize: 14, color: "#FFFFFF" }}>
                    {isCorrecting ? "Searching..." : "Search"}
                  </Text>
                </Pressable>
              </View>

              {hasSearched && searchResults.length === 0 && (
                <View style={{ alignItems: "center", paddingVertical: 16, gap: 6 }}>
                  <Ionicons name="search-outline" size={28} color={colors.textTertiary} />
                  <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 14, color: colors.textSecondary }}>No cards found</Text>
                  <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.textTertiary, textAlign: "center" }}>
                    Try a different name, check the game selection, or remove the set filter.
                  </Text>
                </View>
              )}

              {searchResults.length > 0 && (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.textSecondary }}>
                    {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} — tap to select
                  </Text>
                  {searchResults.map((r: any, idx: number) => (
                    <Pressable
                      key={`${r.cardId}-${idx}`}
                      style={({ pressed }) => ({
                        flexDirection: "row" as const,
                        gap: 10,
                        padding: 10,
                        borderRadius: 10,
                        backgroundColor: pressed ? colors.tint + "12" : colors.surfaceAlt,
                        borderWidth: 1,
                        borderColor: pressed ? colors.tint + "40" : colors.cardBorder,
                      })}
                      onPress={() => selectSearchResult(r)}
                    >
                      <ScanResultImage uri={r.image} size="medium" colors={colors} />
                      
                      <View style={{ flex: 1, justifyContent: "center", gap: 2 }}>
                        <Text style={{ fontFamily: "DMSans_600SemiBold", fontSize: 14, color: colors.text }} numberOfLines={1}>
                          {r.name}
                        </Text>
                        <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.textSecondary }} numberOfLines={1}>
                          {r.setName}{r.localId ? ` #${r.localId}` : ""}
                        </Text>
                        <View style={{ flexDirection: "row", gap: 4, marginTop: 2 }}>
                          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: colors[r.game as GameId] + "20" }}>
                            <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 10, color: colors[r.game as GameId] }}>
                              {gameLabel(r.game)}
                            </Text>
                          </View>
                          {r.rarity && (
                            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: colors.background }}>
                              <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 10, color: colors.textTertiary }}>
                                {r.rarity}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={{ justifyContent: "center" }}>
                        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}

              <Pressable
                style={({ pressed }) => ({
                  flexDirection: "row" as const,
                  alignItems: "center" as const,
                  justifyContent: "center" as const,
                  gap: 6,
                  paddingVertical: 10,
                  opacity: pressed ? 0.6 : 1,
                })}
                onPress={resetScan}
              >
                <Ionicons name="camera-reverse" size={16} color={colors.textTertiary} />
                <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.textTertiary }}>Retake Photo</Text>
              </Pressable>
            </View>
        </Animated.View>
        );
      })()}

      {imageUri && (
        <View style={dynamicStyles.actions}>
          <Pressable
            style={({ pressed }) => [dynamicStyles.actionButton, dynamicStyles.primaryAction, { backgroundColor: colors.tint }, pressed && { opacity: 0.9 }]}
            onPress={takePhoto}
          >
            <Ionicons name="camera" size={24} color="#FFFFFF" />
            <Text style={dynamicStyles.primaryActionText}>Scan Another</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [dynamicStyles.actionButton, dynamicStyles.secondaryAction, { backgroundColor: colors.surface, borderColor: colors.cardBorder }, pressed && { opacity: 0.9 }]}
            onPress={pickImage}
          >
            <Ionicons name="images" size={22} color={colors.tint} />
            <Text style={[dynamicStyles.secondaryActionText, { color: colors.tint }]}>Library</Text>
          </Pressable>
        </View>
      )}

    </ScrollView>
    </KeyboardAvoidingView>
  );
}

function getDynamicStyles(colors: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    toast: {
      position: "absolute",
      left: 20,
      right: 20,
      zIndex: 100,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.success,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 12,
    },
    toastText: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 14,
      color: "#FFFFFF",
    },
    header: {
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    title: {
      fontFamily: "DMSans_700Bold",
      fontSize: 28,
      color: colors.text,
    },
    subtitle: {
      fontFamily: "DMSans_400Regular",
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 2,
    },
    scanArea: {
      height: 320,
      marginHorizontal: 20,
      marginVertical: 12,
      borderRadius: 20,
      overflow: "hidden",
    },
    emptyState: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 20,
      gap: 16,
    },
    scanHeroBtn: {
      alignItems: "center",
      paddingVertical: 32,
      borderRadius: 20,
      gap: 8,
    },
    scanHeroIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    scanHeroTitle: {
      fontFamily: "DMSans_700Bold",
      fontSize: 22,
      color: "#FFFFFF",
    },
    scanHeroSub: {
      fontFamily: "DMSans_400Regular",
      fontSize: 14,
      color: "rgba(255,255,255,0.8)",
    },
    scanOptions: {
      flexDirection: "row",
      gap: 12,
    },
    scanOptionBtn: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 16,
      borderRadius: 16,
      borderWidth: 1,
      gap: 6,
    },
    scanOptionIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 2,
    },
    scanOptionLabel: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 14,
    },
    scanOptionDesc: {
      fontFamily: "DMSans_400Regular",
      fontSize: 11,
    },
    scanTips: {
      paddingHorizontal: 4,
      paddingTop: 8,
      gap: 8,
    },
    scanTipsTitle: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 13,
    },
    scanTipRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    scanTipText: {
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
    },
    previewWrapper: {
      flex: 1,
      borderRadius: 20,
      overflow: "hidden",
    },
    preview: {
      flex: 1,
    },
    scanningOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(250, 247, 242, 0.85)",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
    scanningText: {
      fontFamily: "DMSans_500Medium",
      fontSize: 15,
    },
    clearButton: {
      position: "absolute",
      top: 12,
      right: 12,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: "rgba(0,0,0,0.5)",
      alignItems: "center",
      justifyContent: "center",
    },
    resultCard: {
      marginHorizontal: 20,
      borderRadius: 16,
      padding: 16,
      gap: 14,
      borderWidth: 1,
    },
    resultHeader: {
      flexDirection: "row",
      gap: 12,
    },
    resultInfo: {
      flex: 1,
      gap: 4,
    },
    resultName: {
      fontFamily: "DMSans_700Bold",
      fontSize: 17,
    },
    resultSet: {
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
    },
    resultMeta: {
      flexDirection: "row",
      gap: 6,
      marginTop: 4,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    badgeText: {
      fontFamily: "DMSans_500Medium",
      fontSize: 11,
    },
    priceTag: {
      alignItems: "flex-end",
      justifyContent: "center",
      gap: 2,
    },
    priceLabel: {
      fontFamily: "DMSans_400Regular",
      fontSize: 11,
    },
    priceValue: {
      fontFamily: "DMSans_700Bold",
      fontSize: 22,
    },
    ownedBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
    },
    ownedBannerText: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 13,
    },
    quantityRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    quantityLabel: {
      fontFamily: "DMSans_500Medium",
      fontSize: 14,
    },
    quantityStepper: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    stepperButton: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    quantityValue: {
      fontFamily: "DMSans_700Bold",
      fontSize: 18,
      minWidth: 32,
      textAlign: "center" as const,
    },
    addButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 14,
      borderRadius: 12,
    },
    addButtonText: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 15,
      color: "#FFFFFF",
    },
    actions: {
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    actionButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 14,
      borderRadius: 14,
    },
    primaryAction: {
      flex: 2,
    },
    primaryActionText: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 15,
      color: "#FFFFFF",
    },
    secondaryAction: {
      flex: 1,
      borderWidth: 1,
    },
    secondaryActionText: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 15,
    },
  });
}
