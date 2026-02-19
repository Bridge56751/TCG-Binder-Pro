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
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { CameraView, useCameraPermissions } from "expo-camera";
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
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  SlideInUp,
  SlideOutUp,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CAMERA_HEIGHT = Math.min(SCREEN_WIDTH * 1.15, 480);

function gameLabel(game: GameId): string {
  if (game === "pokemon") return "Pokemon";
  if (game === "yugioh") return "Yu-Gi-Oh!";
  if (game === "mtg") return "Magic";
  return "One Piece";
}

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<CardIdentification | null>(null);
  const { addCard, hasCard, cardQuantity } = useCollection();

  const [batchMode, setBatchMode] = useState(false);
  const [batchCount, setBatchCount] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addQuantity, setAddQuantity] = useState(1);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 84 + 34 : 100;

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(msg);
    toastTimer.current = setTimeout(() => {
      setToastMessage(null);
    }, 2000);
  }, []);

  const capturePhoto = async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.8,
      });
      if (photo) {
        setImageUri(photo.uri);
        setScanResult(null);
        identifyCard(photo.base64!);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to capture photo. Please try again.");
    } finally {
      setIsCapturing(false);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
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
    await addCard(
      scanResult.game,
      scanResult.setId,
      cardId,
      addQuantity
    );
    await addToScanHistory(scanResult, true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const qtyLabel = addQuantity > 1 ? `${addQuantity} copies of ` : "";

    if (batchMode) {
      setBatchCount((c) => c + addQuantity);
      showToast(`${qtyLabel}${scanResult.englishName || scanResult.name} added!`);
      resetScan();
    } else {
      Alert.alert(
        "Added!",
        `${qtyLabel}${scanResult.englishName || scanResult.name} has been added to your collection.`,
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
  };

  const dynamicStyles = getDynamicStyles(colors);

  const renderCameraView = () => {
    if (imageUri) {
      return (
        <View style={dynamicStyles.cameraContainer}>
          <Animated.View entering={FadeIn.duration(300)} style={dynamicStyles.previewWrapper}>
            <Image source={{ uri: imageUri }} style={dynamicStyles.preview} contentFit="contain" />
            {isScanning && (
              <View style={dynamicStyles.scanningOverlay}>
                <View style={dynamicStyles.scanningPill}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={dynamicStyles.scanningText}>Identifying card...</Text>
                </View>
              </View>
            )}
            <Pressable style={dynamicStyles.clearButton} onPress={resetScan}>
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </Pressable>
          </Animated.View>
        </View>
      );
    }

    if (Platform.OS === "web") {
      return (
        <View style={dynamicStyles.cameraContainer}>
          <View style={[dynamicStyles.webFallback, { backgroundColor: colors.surfaceAlt }]}>
            <MaterialCommunityIcons name="camera-off" size={40} color={colors.textTertiary} />
            <Text style={[dynamicStyles.webFallbackText, { color: colors.textSecondary }]}>
              Live camera not available on web
            </Text>
            <Text style={[dynamicStyles.webFallbackHint, { color: colors.textTertiary }]}>
              Use the buttons below to take a photo or pick from gallery
            </Text>
          </View>
        </View>
      );
    }

    if (!permission) {
      return (
        <View style={dynamicStyles.cameraContainer}>
          <View style={[dynamicStyles.webFallback, { backgroundColor: colors.surfaceAlt }]}>
            <ActivityIndicator size="large" color={colors.tint} />
          </View>
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={dynamicStyles.cameraContainer}>
          <View style={[dynamicStyles.webFallback, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="camera" size={40} color={colors.textTertiary} />
            <Text style={[dynamicStyles.webFallbackText, { color: colors.textSecondary }]}>
              Camera access needed
            </Text>
            {permission.status === "denied" && !permission.canAskAgain ? (
              <Text style={[dynamicStyles.webFallbackHint, { color: colors.textTertiary }]}>
                Please enable camera access in your device settings
              </Text>
            ) : (
              <Pressable
                style={[dynamicStyles.permissionButton, { backgroundColor: colors.tint }]}
                onPress={requestPermission}
              >
                <Text style={dynamicStyles.permissionButtonText}>Enable Camera</Text>
              </Pressable>
            )}
          </View>
        </View>
      );
    }

    return (
      <View style={dynamicStyles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={dynamicStyles.camera}
          facing={facing}
          flash={flashEnabled ? "on" : "off"}
        >
          <View style={dynamicStyles.cameraOverlay}>
            <View style={dynamicStyles.cardFrame}>
              <View style={[dynamicStyles.frameCorner, dynamicStyles.frameTL]} />
              <View style={[dynamicStyles.frameCorner, dynamicStyles.frameTR]} />
              <View style={[dynamicStyles.frameCorner, dynamicStyles.frameBL]} />
              <View style={[dynamicStyles.frameCorner, dynamicStyles.frameBR]} />
            </View>
            <Text style={dynamicStyles.frameHint}>Align card within frame</Text>
          </View>

          <View style={dynamicStyles.cameraTopBar}>
            <Pressable
              style={dynamicStyles.cameraControlButton}
              onPress={() => setFlashEnabled((f) => !f)}
            >
              <Ionicons
                name={flashEnabled ? "flash" : "flash-off"}
                size={22}
                color="#FFFFFF"
              />
            </Pressable>
            <Pressable
              style={dynamicStyles.cameraControlButton}
              onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
            >
              <Ionicons name="camera-reverse" size={22} color="#FFFFFF" />
            </Pressable>
          </View>

          <View style={dynamicStyles.cameraBottomBar}>
            <Pressable style={dynamicStyles.galleryButton} onPress={pickImage}>
              <Ionicons name="images" size={24} color="#FFFFFF" />
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                dynamicStyles.shutterButton,
                pressed && { transform: [{ scale: 0.92 }] },
                isCapturing && { opacity: 0.6 },
              ]}
              onPress={capturePhoto}
              disabled={isCapturing}
            >
              <View style={dynamicStyles.shutterInner} />
            </Pressable>
            <View style={dynamicStyles.galleryButton}>
              {batchMode && batchCount > 0 ? (
                <View style={[dynamicStyles.batchFloatingCounter, { backgroundColor: colors.success }]}>
                  <Text style={dynamicStyles.batchFloatingText}>{batchCount}</Text>
                </View>
              ) : (
                <View style={{ width: 44 }} />
              )}
            </View>
          </View>
        </CameraView>
      </View>
    );
  };

  return (
    <ScrollView
      style={[dynamicStyles.container, { paddingTop: topInset }]}
      contentContainerStyle={{ paddingBottom: bottomInset }}
      showsVerticalScrollIndicator={false}
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
            <Text style={[dynamicStyles.title, { color: colors.text }]}>Scan Card</Text>
            <Text style={[dynamicStyles.subtitle, { color: colors.textSecondary }]}>
              Point your camera at a card
            </Text>
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

      {renderCameraView()}

      {Platform.OS === "web" && !imageUri && (
        <View style={dynamicStyles.webActions}>
          <Pressable
            style={({ pressed }) => [
              dynamicStyles.webActionButton,
              { backgroundColor: colors.tint },
              pressed && { opacity: 0.9 },
            ]}
            onPress={async () => {
              const { status } = await ImagePicker.requestCameraPermissionsAsync();
              if (status !== "granted") {
                Alert.alert("Permission needed", "Camera access is required to scan cards");
                return;
              }
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ["images"],
                quality: 0.8,
                base64: true,
              });
              if (!result.canceled && result.assets[0]) {
                setImageUri(result.assets[0].uri);
                setScanResult(null);
                identifyCard(result.assets[0].base64!);
              }
            }}
          >
            <Ionicons name="camera" size={22} color="#FFFFFF" />
            <Text style={dynamicStyles.webActionText}>Take Photo</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              dynamicStyles.webActionButton,
              { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder },
              pressed && { opacity: 0.9 },
            ]}
            onPress={pickImage}
          >
            <Ionicons name="images" size={22} color={colors.tint} />
            <Text style={[dynamicStyles.webActionText, { color: colors.tint }]}>Gallery</Text>
          </Pressable>
        </View>
      )}

      {scanResult && (() => {
        const isVerified = scanResult.verified === true;
        const cardId = scanResult.verifiedCardId || `${scanResult.setId}-${scanResult.cardNumber}`;
        const alreadyOwned = isVerified && hasCard(scanResult.game, scanResult.setId, cardId);
        const ownedQty = alreadyOwned ? cardQuantity(scanResult.game, scanResult.setId, cardId) : 0;
        return (
        <Animated.View entering={FadeInDown.duration(400).springify()} style={[dynamicStyles.resultCard, { backgroundColor: colors.surface, borderColor: isVerified ? colors.cardBorder : colors.error + "40" }]}>
          {!isVerified && (
            <View style={{ backgroundColor: colors.error + "12", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Ionicons name="warning" size={20} color={colors.error} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "DMSans_600SemiBold", fontSize: 14, color: colors.error, marginBottom: 2 }}>Could not verify this card</Text>
                <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.textSecondary }}>
                  Try rescanning with better lighting or a clearer angle.
                </Text>
              </View>
            </View>
          )}
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
            <Pressable
              style={({ pressed }) => [dynamicStyles.addButton, { backgroundColor: colors.error }, pressed && { opacity: 0.9 }]}
              onPress={resetScan}
            >
              <Ionicons name="refresh" size={20} color="#FFFFFF" />
              <Text style={dynamicStyles.addButtonText}>Rescan Card</Text>
            </Pressable>
          )}
        </Animated.View>
        );
      })()}
    </ScrollView>
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
      paddingVertical: 8,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    title: {
      fontFamily: "DMSans_700Bold",
      fontSize: 28,
    },
    subtitle: {
      fontFamily: "DMSans_400Regular",
      fontSize: 14,
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
    cameraContainer: {
      marginHorizontal: 12,
      marginVertical: 8,
      height: CAMERA_HEIGHT,
      borderRadius: 20,
      overflow: "hidden",
    },
    camera: {
      flex: 1,
    },
    cameraOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
    },
    cardFrame: {
      width: SCREEN_WIDTH * 0.6,
      height: SCREEN_WIDTH * 0.6 * 1.4,
      maxHeight: CAMERA_HEIGHT * 0.7,
      position: "relative",
    },
    frameCorner: {
      position: "absolute",
      width: 28,
      height: 28,
      borderColor: "#FFFFFF",
    },
    frameTL: {
      top: 0,
      left: 0,
      borderTopWidth: 3,
      borderLeftWidth: 3,
      borderTopLeftRadius: 8,
    },
    frameTR: {
      top: 0,
      right: 0,
      borderTopWidth: 3,
      borderRightWidth: 3,
      borderTopRightRadius: 8,
    },
    frameBL: {
      bottom: 0,
      left: 0,
      borderBottomWidth: 3,
      borderLeftWidth: 3,
      borderBottomLeftRadius: 8,
    },
    frameBR: {
      bottom: 0,
      right: 0,
      borderBottomWidth: 3,
      borderRightWidth: 3,
      borderBottomRightRadius: 8,
    },
    frameHint: {
      fontFamily: "DMSans_500Medium",
      fontSize: 13,
      color: "rgba(255,255,255,0.8)",
      marginTop: 12,
      textShadowColor: "rgba(0,0,0,0.5)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    cameraTopBar: {
      position: "absolute",
      top: 12,
      right: 12,
      flexDirection: "row",
      gap: 10,
    },
    cameraControlButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.4)",
      alignItems: "center",
      justifyContent: "center",
    },
    cameraBottomBar: {
      position: "absolute",
      bottom: 16,
      left: 0,
      right: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 32,
    },
    galleryButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: "rgba(0,0,0,0.4)",
      alignItems: "center",
      justifyContent: "center",
    },
    shutterButton: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: "rgba(255,255,255,0.3)",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 3,
      borderColor: "#FFFFFF",
    },
    shutterInner: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: "#FFFFFF",
    },
    batchFloatingCounter: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    batchFloatingText: {
      fontFamily: "DMSans_700Bold",
      fontSize: 16,
      color: "#FFFFFF",
    },
    previewWrapper: {
      flex: 1,
      backgroundColor: colors.surfaceAlt,
    },
    preview: {
      flex: 1,
    },
    scanningOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.5)",
      alignItems: "center",
      justifyContent: "center",
    },
    scanningPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: "rgba(0,0,0,0.7)",
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 24,
    },
    scanningText: {
      fontFamily: "DMSans_500Medium",
      fontSize: 15,
      color: "#FFFFFF",
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
    webFallback: {
      flex: 1,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
    webFallbackText: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 16,
    },
    webFallbackHint: {
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
      textAlign: "center" as const,
      paddingHorizontal: 40,
    },
    permissionButton: {
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 12,
      marginTop: 4,
    },
    permissionButtonText: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 15,
      color: "#FFFFFF",
    },
    webActions: {
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    webActionButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 14,
      borderRadius: 14,
    },
    webActionText: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 15,
      color: "#FFFFFF",
    },
    resultCard: {
      marginHorizontal: 20,
      marginTop: 12,
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
      flexWrap: "wrap",
    },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
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
  });
}
