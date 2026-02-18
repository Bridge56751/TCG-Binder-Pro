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
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system";
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

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
  const { addCard } = useCollection();

  const [batchMode, setBatchMode] = useState(false);
  const [batchCount, setBatchCount] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
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

  const openCamera = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert("Permission needed", "Camera access is required to scan cards");
        return;
      }
    }
    setCameraOpen(true);
  };

  const capturePhoto = async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
      });
      if (photo) {
        setCameraOpen(false);
        setImageUri(photo.uri);
        setScanResult(null);
        if (photo.base64) {
          identifyCard(photo.base64);
        }
      }
    } catch (e) {
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
    await addCard(
      scanResult.game,
      scanResult.setId,
      `${scanResult.setId}-${scanResult.cardNumber}`
    );
    await addToScanHistory(scanResult, true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (batchMode) {
      setBatchCount((c) => c + 1);
      showToast(`${scanResult.name} added!`);
      resetScan();
    } else {
      Alert.alert(
        "Added!",
        `${scanResult.name} has been added to your collection.`,
        [
          { text: "Scan Another", onPress: resetScan },
          {
            text: "View Set",
            onPress: () =>
              router.push({
                pathname: "/set/[game]/[id]",
                params: { game: scanResult.game, id: scanResult.setId },
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
  };

  const dynamicStyles = getDynamicStyles(colors);

  if (cameraOpen) {
    return (
      <View style={cameraStyles.container}>
        <CameraView
          ref={cameraRef}
          style={cameraStyles.camera}
          facing="back"
        >
          <View style={cameraStyles.overlay} pointerEvents="box-none">
            <View style={[cameraStyles.dimArea, cameraStyles.dimTop]} />
            <View style={cameraStyles.middleRow}>
              <View style={cameraStyles.dimSide} />
              <View style={cameraStyles.cardCutout}>
                <View style={[cameraStyles.guideCorner, cameraStyles.guideTL]} />
                <View style={[cameraStyles.guideCorner, cameraStyles.guideTR]} />
                <View style={[cameraStyles.guideCorner, cameraStyles.guideBL]} />
                <View style={[cameraStyles.guideCorner, cameraStyles.guideBR]} />
                <Text style={cameraStyles.guideText}>Align card here</Text>
              </View>
              <View style={cameraStyles.dimSide} />
            </View>
            <View style={[cameraStyles.dimArea, cameraStyles.dimBottom]} />
          </View>

          <View style={[cameraStyles.topBar, { paddingTop: topInset + 8 }]}>
            <Pressable onPress={() => setCameraOpen(false)} style={cameraStyles.closeBtn}>
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </Pressable>
          </View>

          <View style={[cameraStyles.bottomBar, { paddingBottom: Platform.OS === "web" ? 40 : insets.bottom + 20 }]}>
            <View style={cameraStyles.shutterOuter}>
              <Pressable
                onPress={capturePhoto}
                disabled={isCapturing}
                style={({ pressed }) => [
                  cameraStyles.shutterBtn,
                  pressed && { transform: [{ scale: 0.92 }] },
                ]}
              >
                {isCapturing ? (
                  <ActivityIndicator size="small" color="#333" />
                ) : (
                  <View style={cameraStyles.shutterInner} />
                )}
              </Pressable>
            </View>
          </View>
        </CameraView>
      </View>
    );
  }

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

      {scanResult && (
        <Animated.View entering={FadeInDown.duration(400).springify()} style={[dynamicStyles.resultCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <View style={dynamicStyles.resultHeader}>
            <View style={dynamicStyles.resultInfo}>
              <Text style={[dynamicStyles.resultName, { color: colors.text }]}>{scanResult.name}</Text>
              <Text style={[dynamicStyles.resultSet, { color: colors.textSecondary }]}>
                {scanResult.setName} - #{scanResult.cardNumber}
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
              </View>
            </View>
            <View style={dynamicStyles.priceTag}>
              <Text style={[dynamicStyles.priceLabel, { color: colors.textTertiary }]}>Value</Text>
              <Text style={[dynamicStyles.priceValue, { color: colors.success }]}>
                ${scanResult.estimatedValue?.toFixed(2) || "0.00"}
              </Text>
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [dynamicStyles.addButton, { backgroundColor: colors.tint }, pressed && { opacity: 0.9 }]}
            onPress={handleAddToCollection}
          >
            <Ionicons name="add-circle" size={20} color="#FFFFFF" />
            <Text style={dynamicStyles.addButtonText}>Add to Collection</Text>
          </Pressable>
        </Animated.View>
      )}

      <View style={dynamicStyles.actions}>
        <Pressable
          style={({ pressed }) => [dynamicStyles.actionButton, dynamicStyles.primaryAction, { backgroundColor: colors.tint }, pressed && { opacity: 0.9 }]}
          onPress={openCamera}
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
  );
}

const CARD_WIDTH = SCREEN_WIDTH * 0.7;
const CARD_HEIGHT = CARD_WIDTH * 1.4;

const cameraStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  dimTop: {
    flex: 1,
  },
  dimBottom: {
    flex: 1,
  },
  dimArea: {
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  middleRow: {
    flexDirection: "row",
    height: CARD_HEIGHT,
  },
  dimSide: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  cardCutout: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  guideCorner: {
    position: "absolute",
    width: 28,
    height: 28,
    borderColor: "#FFFFFF",
  },
  guideTL: {
    top: -1,
    left: -1,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  guideTR: {
    top: -1,
    right: -1,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  guideBL: {
    bottom: -1,
    left: -1,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  guideBR: {
    bottom: -1,
    right: -1,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  guideText: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    marginTop: 60,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingTop: 20,
    zIndex: 10,
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterBtn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#FFFFFF",
  },
});

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
