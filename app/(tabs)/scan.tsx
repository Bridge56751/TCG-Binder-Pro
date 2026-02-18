import React, { useState, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { useCollection } from "@/lib/CollectionContext";
import type { CardIdentification, GameId } from "@/lib/types";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<CardIdentification | null>(null);
  const { addCard } = useCollection();

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 84 + 34 : 100;

  const takePhoto = async () => {
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
  };

  const resetScan = () => {
    setImageUri(null);
    setScanResult(null);
    setIsScanning(false);
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Scan Card</Text>
        <Text style={styles.subtitle}>Take a photo or pick from your library</Text>
      </View>

      <View style={styles.scanArea}>
        {imageUri ? (
          <Animated.View entering={FadeIn.duration(300)} style={styles.previewWrapper}>
            <Image source={{ uri: imageUri }} style={styles.preview} contentFit="contain" />
            {isScanning && (
              <View style={styles.scanningOverlay}>
                <ActivityIndicator size="large" color={Colors.light.tint} />
                <Text style={styles.scanningText}>Identifying card...</Text>
              </View>
            )}
            <Pressable style={styles.clearButton} onPress={resetScan}>
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </Pressable>
          </Animated.View>
        ) : (
          <View style={styles.placeholder}>
            <View style={styles.crosshairContainer}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
              <MaterialCommunityIcons
                name="cards-outline"
                size={48}
                color={Colors.light.textTertiary}
              />
              <Text style={styles.placeholderText}>Position card within frame</Text>
            </View>
          </View>
        )}
      </View>

      {scanResult && (
        <Animated.View entering={FadeInDown.duration(400).springify()} style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <View style={styles.resultInfo}>
              <Text style={styles.resultName}>{scanResult.name}</Text>
              <Text style={styles.resultSet}>
                {scanResult.setName} - #{scanResult.cardNumber}
              </Text>
              <View style={styles.resultMeta}>
                <View style={[styles.badge, { backgroundColor: Colors.light[scanResult.game] + "20" }]}>
                  <Text style={[styles.badgeText, { color: Colors.light[scanResult.game] }]}>
                    {scanResult.game === "pokemon"
                      ? "Pokemon"
                      : scanResult.game === "yugioh"
                        ? "Yu-Gi-Oh!"
                        : "One Piece"}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: Colors.light.surfaceAlt }]}>
                  <Text style={[styles.badgeText, { color: Colors.light.textSecondary }]}>
                    {scanResult.rarity}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.priceTag}>
              <Text style={styles.priceLabel}>Value</Text>
              <Text style={styles.priceValue}>
                ${scanResult.estimatedValue?.toFixed(2) || "0.00"}
              </Text>
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.9 }]}
            onPress={handleAddToCollection}
          >
            <Ionicons name="add-circle" size={20} color="#FFFFFF" />
            <Text style={styles.addButtonText}>Add to Collection</Text>
          </Pressable>
        </Animated.View>
      )}

      <View style={[styles.actions, { paddingBottom: bottomInset }]}>
        <Pressable
          style={({ pressed }) => [styles.actionButton, styles.primaryAction, pressed && { opacity: 0.9 }]}
          onPress={takePhoto}
        >
          <Ionicons name="camera" size={24} color="#FFFFFF" />
          <Text style={styles.primaryActionText}>Take Photo</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionButton, styles.secondaryAction, pressed && { opacity: 0.9 }]}
          onPress={pickImage}
        >
          <Ionicons name="images" size={22} color={Colors.light.tint} />
          <Text style={styles.secondaryActionText}>Library</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: {
    fontFamily: "DMSans_700Bold",
    fontSize: 28,
    color: Colors.light.text,
  },
  subtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  scanArea: {
    flex: 1,
    marginHorizontal: 20,
    marginVertical: 12,
    borderRadius: 20,
    overflow: "hidden",
  },
  placeholder: {
    flex: 1,
    backgroundColor: Colors.light.surfaceAlt,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Colors.light.cardBorder,
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
    borderColor: Colors.light.tint,
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
    color: Colors.light.textTertiary,
  },
  previewWrapper: {
    flex: 1,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: Colors.light.surfaceAlt,
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
    color: Colors.light.text,
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
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.light.cardBorder,
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
    color: Colors.light.text,
  },
  resultSet: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
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
    color: Colors.light.textTertiary,
  },
  priceValue: {
    fontFamily: "DMSans_700Bold",
    fontSize: 22,
    color: Colors.light.success,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.light.tint,
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
    backgroundColor: Colors.light.tint,
  },
  primaryActionText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: "#FFFFFF",
  },
  secondaryAction: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.cardBorder,
  },
  secondaryActionText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: Colors.light.tint,
  },
});
