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
import type { CardIdentification, GameId } from "@/lib/types";
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

function gameLabel(game: GameId): string {
  if (game === "pokemon") return "Pokemon";
  if (game === "yugioh") return "Yu-Gi-Oh!";
  if (game === "mtg") return "Magic";
  return "One Piece";
}

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<CardIdentification | null>(null);
  const { addCard, hasCard, cardQuantity } = useCollection();

  const [batchMode, setBatchMode] = useState(false);
  const [batchCount, setBatchCount] = useState(0);
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
      Alert.alert("Permission needed", "Camera access is required to scan cards");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 1.0,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setScanResult(null);
      identifyCard(result.assets[0].base64!);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1.0,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setScanResult(null);
      identifyCard(result.assets[0].base64!);
    }
  };

  const identifyCard = async (base64: string) => {
    setIsScanning(true);
    try {
      const res = await apiRequest("POST", "/api/identify-card", { image: base64 });
      const data: CardIdentification = await res.json();
      if (data.error) {
        Alert.alert("Could not identify", data.error);
        setScanResult(null);
      } else {
        setScanResult(data);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to identify the card. Please try again.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddToCollection = async () => {
    if (!scanResult) return;
    const cardId = scanResult.verifiedCardId || `${scanResult.setId}-${scanResult.cardNumber}`;
    try {
      await addCard(
        scanResult.game,
        scanResult.setId,
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
    await addToScanHistory(scanResult, true);
    cacheCard({
      id: scanResult.verifiedCardId || `${scanResult.setId}-${scanResult.cardNumber}`,
      localId: scanResult.cardNumber,
      name: scanResult.name,
      englishName: scanResult.englishName,
      image: null,
      game: scanResult.game,
      setId: scanResult.setId,
      setName: scanResult.setName,
      rarity: scanResult.rarity,
      currentPrice: scanResult.estimatedValue,
      cachedAt: Date.now(),
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const qtyLabel = addQuantity > 1 ? `${addQuantity} copies of ` : "";

    if (batchMode) {
      setBatchCount((c) => c + addQuantity);
      showToast(`${qtyLabel}${scanResult.name} added!`);
      resetScan();
    } else {
      Alert.alert(
        "Added!",
        `${qtyLabel}${scanResult.name} has been added to your collection.`,
        [
          { text: "Scan Another", onPress: resetScan },
          {
            text: "View Set",
            onPress: () =>
              router.push({
                pathname: "/set/[game]/[id]",
                params: { game: scanResult.game, id: scanResult.setId, lang: scanResult.language || "en" },
              }),
          },
        ]
      );
    }
  };

  const resetScan = () => {
    setImageUri(null);
    setScanResult(null);
    setIsScanning(false);
    setAddQuantity(1);
    setIsEditing(false);
    setEditName("");
    setEditCardNumber("");
    setEditSetName("");
    setSearchResults([]);
    setHasSearched(false);
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
    if (batchMode) {
      setBatchCount((c) => c + addQuantity);
      showToast(`${qtyLabel}${corrected.name} added!`);
      resetScan();
    } else {
      setScanResult(null);
      resetScan();
      showToast(`${qtyLabel}${corrected.name} added to collection!`);
    }
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

      <View style={dynamicStyles.header}>
        <View style={dynamicStyles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={dynamicStyles.title}>Scan Card</Text>
            <Text style={dynamicStyles.subtitle}>Take a photo or pick from your library</Text>
          </View>
          <View style={dynamicStyles.batchToggleArea}>
            {batchMode && batchCount > 0 && (
              <View style={[dynamicStyles.batchCounter, { backgroundColor: colors.success + "20" }]}>
                <Text style={[dynamicStyles.batchCounterText, { color: colors.success }]}>
                  {batchCount}
                </Text>
              </View>
            )}
            <Pressable
              style={[
                dynamicStyles.batchToggle,
                {
                  backgroundColor: batchMode ? colors.tint : colors.surfaceAlt,
                },
              ]}
              onPress={() => {
                setBatchMode((b) => !b);
                if (!batchMode) setBatchCount(0);
              }}
            >
              <Ionicons
                name="layers"
                size={16}
                color={batchMode ? "#FFFFFF" : colors.textSecondary}
              />
              <Text
                style={[
                  dynamicStyles.batchToggleText,
                  { color: batchMode ? "#FFFFFF" : colors.textSecondary },
                ]}
              >
                Batch
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={dynamicStyles.scanArea}>
        {imageUri ? (
          <Animated.View entering={FadeIn.duration(300)} style={[dynamicStyles.previewWrapper, { backgroundColor: colors.surfaceAlt }]}>
            <Image source={{ uri: imageUri }} style={dynamicStyles.preview} contentFit="contain" />
            {isScanning && (
              <View style={dynamicStyles.scanningOverlay}>
                <ActivityIndicator size="large" color={colors.tint} />
                <Text style={[dynamicStyles.scanningText, { color: colors.text }]}>Identifying card...</Text>
              </View>
            )}
            <Pressable style={dynamicStyles.clearButton} onPress={resetScan}>
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </Pressable>
          </Animated.View>
        ) : (
          <View style={[dynamicStyles.placeholder, { backgroundColor: colors.surfaceAlt, borderColor: colors.cardBorder }]}>
            <View style={dynamicStyles.crosshairContainer}>
              <View style={[dynamicStyles.corner, dynamicStyles.topLeft, { borderColor: colors.tint }]} />
              <View style={[dynamicStyles.corner, dynamicStyles.topRight, { borderColor: colors.tint }]} />
              <View style={[dynamicStyles.corner, dynamicStyles.bottomLeft, { borderColor: colors.tint }]} />
              <View style={[dynamicStyles.corner, dynamicStyles.bottomRight, { borderColor: colors.tint }]} />
              <MaterialCommunityIcons
                name="cards-outline"
                size={48}
                color={colors.textTertiary}
              />
              <Text style={[dynamicStyles.placeholderText, { color: colors.textTertiary }]}>Position card within frame</Text>
            </View>
          </View>
        )}
      </View>

      {scanResult && (() => {
        const isVerified = scanResult.verified === true;
        const cardId = scanResult.verifiedCardId || `${scanResult.setId}-${scanResult.cardNumber}`;
        const alreadyOwned = isVerified && hasCard(scanResult.game, scanResult.setId, cardId);
        const ownedQty = alreadyOwned ? cardQuantity(scanResult.game, scanResult.setId, cardId) : 0;
        return (
        <Animated.View entering={FadeInDown.duration(400).springify()} style={[dynamicStyles.resultCard, { backgroundColor: colors.surface, borderColor: isVerified ? colors.cardBorder : colors.error + "40" }]}>
          {!isVerified && !isEditing && (
            <View style={{ backgroundColor: colors.error + "12", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Ionicons name="warning" size={20} color={colors.error} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "DMSans_600SemiBold", fontSize: 14, color: colors.error, marginBottom: 2 }}>Could not verify this card</Text>
                <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.textSecondary }}>
                  Try editing the name or number below, or rescan with better lighting.
                </Text>
              </View>
            </View>
          )}

          {isEditing ? (
            <View style={{ gap: 12 }}>
              <View style={{ backgroundColor: colors.tint + "10", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="search" size={16} color={colors.tint} />
                <Text style={{ fontFamily: "DMSans_600SemiBold", fontSize: 13, color: colors.tint }}>Search for the correct card</Text>
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.textSecondary }}>Game</Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {(["pokemon", "yugioh", "onepiece", "mtg"] as GameId[]).map((g) => (
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
                <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.textSecondary }}>Card Number (optional)</Text>
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
                      {r.image ? (
                        <Image
                          source={{ uri: r.image }}
                          style={{ width: 50, height: 70, borderRadius: 6 }}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={{ width: 50, height: 70, borderRadius: 6, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
                          <MaterialCommunityIcons name="cards-outline" size={20} color={colors.textTertiary} />
                        </View>
                      )}
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
          ) : (
          <View style={{ gap: 14 }}>
          <View style={dynamicStyles.resultHeader}>
            <View style={dynamicStyles.resultInfo}>
              <Text style={[dynamicStyles.resultName, { color: colors.text }]}>
                {scanResult.englishName || scanResult.name}
              </Text>
              {scanResult.englishName && scanResult.englishName !== scanResult.name && (
                <Text style={[dynamicStyles.resultSet, { color: colors.textTertiary }]}>
                  {scanResult.name}
                </Text>
              )}
              <Text style={[dynamicStyles.resultSet, { color: colors.textSecondary }]}>
                {scanResult.englishSetName || scanResult.setName} - #{scanResult.cardNumber}
              </Text>
              <View style={dynamicStyles.resultMeta}>
                <View style={[dynamicStyles.badge, { backgroundColor: colors[scanResult.game] + "20" }]}>
                  <Text style={[dynamicStyles.badgeText, { color: colors[scanResult.game] }]}>
                    {gameLabel(scanResult.game)}
                  </Text>
                </View>
                <View style={[dynamicStyles.badge, { backgroundColor: colors.surfaceAlt }]}>
                  <Text style={[dynamicStyles.badgeText, { color: colors.textSecondary }]}>
                    {scanResult.rarity}
                  </Text>
                </View>
                {isVerified && (
                  <View style={[dynamicStyles.badge, { backgroundColor: colors.success + "18" }]}>
                    <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                    <Text style={[dynamicStyles.badgeText, { color: colors.success }]}>Verified</Text>
                  </View>
                )}
              </View>
            </View>
            {isVerified && (
              <View style={dynamicStyles.priceTag}>
                <Text style={[dynamicStyles.priceLabel, { color: colors.textTertiary }]}>Value</Text>
                <Text style={[dynamicStyles.priceValue, { color: colors.success }]}>
                  ${scanResult.estimatedValue?.toFixed(2) || "0.00"}
                </Text>
              </View>
            )}
          </View>

          {alreadyOwned && (
            <View style={[dynamicStyles.ownedBanner, { backgroundColor: colors.tint + "15" }]}>
              <Ionicons name="checkmark-circle" size={18} color={colors.tint} />
              <Text style={[dynamicStyles.ownedBannerText, { color: colors.tint }]}>
                Already in collection ({ownedQty} owned)
              </Text>
            </View>
          )}

          {isVerified ? (
            <>
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
                    ? `Add ${addQuantity} More`
                    : addQuantity > 1
                      ? `Add ${addQuantity} to Collection`
                      : "Add to Collection"}
                </Text>
              </Pressable>
            </>
          ) : (
            <View style={{ gap: 10 }}>
              <Pressable
                style={({ pressed }) => [dynamicStyles.addButton, { backgroundColor: colors.tint }, pressed && { opacity: 0.9 }]}
                onPress={startEditing}
              >
                <Ionicons name="pencil" size={20} color="#FFFFFF" />
                <Text style={dynamicStyles.addButtonText}>Edit Details</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [dynamicStyles.addButton, { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.cardBorder }, pressed && { opacity: 0.9 }]}
                onPress={resetScan}
              >
                <Ionicons name="refresh" size={18} color={colors.textSecondary} />
                <Text style={[dynamicStyles.addButtonText, { color: colors.textSecondary }]}>Rescan Card</Text>
              </Pressable>
            </View>
          )}

          {isVerified && (
            <Pressable
              style={({ pressed }) => ({
                flexDirection: "row" as const,
                alignItems: "center" as const,
                justifyContent: "center" as const,
                gap: 6,
                paddingVertical: 10,
                opacity: pressed ? 0.6 : 1,
              })}
              onPress={startEditing}
            >
              <Ionicons name="pencil" size={14} color={colors.textTertiary} />
              <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.textTertiary }}>Wrong card? Edit details</Text>
            </Pressable>
          )}
          </View>
          )}
        </Animated.View>
        );
      })()}

      <View style={dynamicStyles.actions}>
        <Pressable
          style={({ pressed }) => [dynamicStyles.actionButton, dynamicStyles.primaryAction, { backgroundColor: colors.tint }, pressed && { opacity: 0.9 }]}
          onPress={takePhoto}
        >
          <Ionicons name="camera" size={24} color="#FFFFFF" />
          <Text style={dynamicStyles.primaryActionText}>Take Photo</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [dynamicStyles.actionButton, dynamicStyles.secondaryAction, { backgroundColor: colors.surface, borderColor: colors.cardBorder }, pressed && { opacity: 0.9 }]}
          onPress={pickImage}
        >
          <Ionicons name="images" size={22} color={colors.tint} />
          <Text style={[dynamicStyles.secondaryActionText, { color: colors.tint }]}>Library</Text>
        </Pressable>
      </View>

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
    batchToggleArea: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    batchCounter: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
    },
    batchCounterText: {
      fontFamily: "DMSans_700Bold",
      fontSize: 12,
    },
    batchToggle: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
    },
    batchToggleText: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 13,
    },
    scanArea: {
      height: 320,
      marginHorizontal: 20,
      marginVertical: 12,
      borderRadius: 20,
      overflow: "hidden",
    },
    placeholder: {
      flex: 1,
      borderRadius: 20,
      borderWidth: 2,
      borderStyle: "dashed",
      alignItems: "center",
      justifyContent: "center",
    },
    crosshairContainer: {
      width: 200,
      height: 280,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
    corner: {
      position: "absolute",
      width: 30,
      height: 30,
    },
    topLeft: {
      top: 0,
      left: 0,
      borderTopWidth: 3,
      borderLeftWidth: 3,
      borderTopLeftRadius: 8,
    },
    topRight: {
      top: 0,
      right: 0,
      borderTopWidth: 3,
      borderRightWidth: 3,
      borderTopRightRadius: 8,
    },
    bottomLeft: {
      bottom: 0,
      left: 0,
      borderBottomWidth: 3,
      borderLeftWidth: 3,
      borderBottomLeftRadius: 8,
    },
    bottomRight: {
      bottom: 0,
      right: 0,
      borderBottomWidth: 3,
      borderRightWidth: 3,
      borderBottomRightRadius: 8,
    },
    placeholderText: {
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
