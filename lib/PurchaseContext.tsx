import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { Platform, Alert } from "react-native";
import { useAuth } from "./AuthContext";
import { apiRequest } from "./query-client";
import { router } from "expo-router";
import { PremiumContext } from "./PremiumContext";
const REVENUECAT_API_KEY = "appl_SSTytUsLoMQInalBawWscUFhGRp";
const ENTITLEMENT_ID = "TCG Binder Pro Ultimate Pro";

let Purchases: any = null;
if (Platform.OS !== "web") {
  try {
    Purchases = require("react-native-purchases").default;
  } catch {}
}

interface PurchaseContextValue {
  isPremium: boolean;
  loading: boolean;
  packages: any[];
  purchasePremium: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
}

export const PurchaseContext = createContext<PurchaseContextValue | null>(null);

export function PurchaseProvider({ children }: { children: ReactNode }) {
  const { user, isGuest, setPremiumStatus } = useAuth();
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<any[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const initPurchases = async () => {
      if (!Purchases || !REVENUECAT_API_KEY || initialized) {
        setLoading(false);
        return;
      }

      try {
        Purchases.configure({ apiKey: REVENUECAT_API_KEY });
        setInitialized(true);

        if (user) {
          try {
            await Purchases.logIn(user.id);
          } catch {}
        }

        const customerInfo = await Purchases.getCustomerInfo();
        const hasPremium = !!customerInfo.entitlements.active[ENTITLEMENT_ID];
        setIsPremium(hasPremium);

        if (hasPremium && user) {
          syncPremiumToBackend();
        }

        try {
          const offerings = await Purchases.getOfferings();
          console.log("[RevenueCat] Offerings:", JSON.stringify({
            hasCurrent: !!offerings.current,
            currentId: offerings.current?.identifier,
            packageCount: offerings.current?.availablePackages?.length || 0,
            allOfferingIds: Object.keys(offerings.all || {}),
          }));
          if (offerings.current && offerings.current.availablePackages.length > 0) {
            setPackages(offerings.current.availablePackages);
          } else {
            const allOfferings = Object.values(offerings.all || {}) as any[];
            for (const offering of allOfferings) {
              if (offering.availablePackages?.length > 0) {
                console.log("[RevenueCat] Using non-default offering:", offering.identifier);
                setPackages(offering.availablePackages);
                break;
              }
            }
          }
        } catch (e) {
          console.log("[RevenueCat] Offerings error:", e);
        }
      } catch (e) {
        console.log("RevenueCat init (preview mode in Expo Go is normal):", e);
      }

      setLoading(false);
    };

    initPurchases();
  }, [user]);

  const syncPremiumToBackend = useCallback(async () => {
    if (!user || !Purchases) return;
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      const rcUserId = customerInfo.originalAppUserId || "";
      await apiRequest("POST", "/api/auth/upgrade-premium", { rcUserId });
      setPremiumStatus(true);
    } catch {}
  }, [user, setPremiumStatus]);

  useEffect(() => {
    if (user?.isPremium) {
      setIsPremium(true);
    }
  }, [user]);

  const purchasePremium = useCallback(async (): Promise<boolean> => {
    if (!Purchases) {
      Alert.alert("Not Available", "In-app purchases are only available on mobile devices.");
      return false;
    }
    try {
      if (!initialized) {
        try {
          Purchases.configure({ apiKey: REVENUECAT_API_KEY });
          setInitialized(true);
        } catch (configErr) {
          console.log("[Purchase] Configure error:", configErr);
        }
      }

      let currentPackages = packages;
      if (currentPackages.length === 0) {
        const offerings = await Purchases.getOfferings();
        if (offerings.current && offerings.current.availablePackages.length > 0) {
          currentPackages = offerings.current.availablePackages;
        } else {
          const allOfferings = Object.values(offerings.all || {}) as any[];
          for (const offering of allOfferings) {
            if (offering.availablePackages?.length > 0) {
              currentPackages = offering.availablePackages;
              break;
            }
          }
        }
        if (currentPackages.length === 0) {
          Alert.alert("Not Available", "No subscription packages found. Please make sure your RevenueCat offering has a package with a linked App Store product.");
          return false;
        }
        setPackages(currentPackages);
      }

      const targetPackage = currentPackages[0];
      if (!targetPackage) {
        Alert.alert("Not Available", "The premium upgrade is not available right now.");
        return false;
      }

      console.log("[Purchase] Attempting purchase of package:", targetPackage.identifier);
      const { customerInfo } = await Purchases.purchasePackage(targetPackage);
      console.log("[Purchase] Active entitlements:", Object.keys(customerInfo.entitlements.active));
      const hasPremium = !!customerInfo.entitlements.active[ENTITLEMENT_ID];

      if (hasPremium) {
        setIsPremium(true);
        await syncPremiumToBackend();
        return true;
      }
      Alert.alert("Purchase Issue", "Purchase completed but premium entitlement not found. Check that your RevenueCat entitlement ID matches: \"" + ENTITLEMENT_ID + "\"");
      return false;
    } catch (e: any) {
      if (!e.userCancelled) {
        console.log("[Purchase] Error:", JSON.stringify(e, null, 2));
        Alert.alert("Purchase Failed", e.message || "Something went wrong. Please try again.");
      }
      return false;
    }
  }, [packages, syncPremiumToBackend, initialized]);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    if (!Purchases) {
      Alert.alert("Not Available", "Purchase restoration is only available on mobile devices.");
      return false;
    }
    try {
      const customerInfo = await Purchases.restorePurchases();
      const hasPremium = !!customerInfo.entitlements.active[ENTITLEMENT_ID];

      if (hasPremium) {
        setIsPremium(true);
        if (user) {
          await syncPremiumToBackend();
          Alert.alert("Restored", "Your premium access has been restored.");
        } else if (isGuest) {
          Alert.alert(
            "Premium Restored!",
            "Create a free account to enable cloud backup and keep your premium subscription linked.",
            [
              { text: "Later", style: "cancel" },
              { text: "Create Account", onPress: () => router.push("/auth?modal=1") },
            ]
          );
        } else {
          Alert.alert("Restored", "Your premium access has been restored.");
        }
        return true;
      } else {
        Alert.alert("No Purchases Found", "No previous purchases were found for this account.");
        return false;
      }
    } catch {
      Alert.alert("Restore Failed", "Could not restore purchases. Please try again.");
      return false;
    }
  }, [syncPremiumToBackend, user, isGuest]);

  const value = useMemo(() => ({
    isPremium,
    loading,
    packages,
    purchasePremium,
    restorePurchases,
  }), [isPremium, loading, packages, purchasePremium, restorePurchases]);

  return (
    <PurchaseContext.Provider value={value}>
      <PremiumContext.Provider value={isPremium}>
        {children}
      </PremiumContext.Provider>
    </PurchaseContext.Provider>
  );
}

export function usePurchase() {
  const ctx = useContext(PurchaseContext);
  if (!ctx) throw new Error("usePurchase must be used within PurchaseProvider");
  return ctx;
}
