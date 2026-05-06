import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlanId = 'full' | 'digital';

export interface RevenueCatProduct {
  productIdentifier: string;
  priceString: string;
  localizedTitle: string;
}

export interface UseRevenueCatReturn {
  isNative: boolean;
  isLoading: boolean;
  isPurchasing: boolean;
  products: Record<PlanId, RevenueCatProduct | null>;
  purchasePlan: (planId: PlanId) => Promise<{ success: boolean; error?: string }>;
  initialize: (userId: string) => Promise<void>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const PRODUCT_IDS: Record<PlanId, string> = {
  full: 'hatov_premium_monthly',
  digital: 'hatov_basic_monthly',
};

// Replace these with your actual RevenueCat API keys from:
// RevenueCat Dashboard → Project → Apps → Public SDK Key
const RC_API_KEY_IOS = 'appl_REPLACE_WITH_IOS_KEY';
const RC_API_KEY_ANDROID = 'goog_REPLACE_WITH_ANDROID_KEY';

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRevenueCat(): UseRevenueCatReturn {
  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();

  const [isLoading, setIsLoading] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [products, setProducts] = useState<Record<PlanId, RevenueCatProduct | null>>({
    full: null,
    digital: null,
  });

  // Configure RevenueCat and fetch offerings on mount (native only).
  useEffect(() => {
    if (!isNative) return;

    const setup = async () => {
      setIsLoading(true);
      try {
        const { Purchases } = await import('@revenuecat/purchases-capacitor');

        const apiKey = platform === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
        await Purchases.configure({ apiKey });

        const { offerings } = await Purchases.getOfferings();
        const current = offerings?.current;

        if (current?.availablePackages) {
          const productMap: Record<PlanId, RevenueCatProduct | null> = {
            full: null,
            digital: null,
          };

          for (const pkg of current.availablePackages) {
            const id = pkg.storeProduct.productIdentifier;
            const entry = Object.entries(PRODUCT_IDS).find(([, storeId]) => storeId === id);
            if (entry) {
              const planId = entry[0] as PlanId;
              productMap[planId] = {
                productIdentifier: id,
                priceString: pkg.storeProduct.priceString,
                localizedTitle: pkg.storeProduct.localizedTitle,
              };
            }
          }

          setProducts(productMap);
        }
      } catch (err) {
        console.error('[RevenueCat] setup error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    setup();
  }, [isNative, platform]);

  // Call this AFTER signUp succeeds to link the purchase to the Supabase user ID.
  const initialize = useCallback(async (userId: string) => {
    if (!isNative) return;
    try {
      const { Purchases } = await import('@revenuecat/purchases-capacitor');
      await Purchases.logIn({ appUserID: userId });
    } catch (err) {
      console.error('[RevenueCat] logIn error:', err);
    }
  }, [isNative]);

  // Triggers the native IAP purchase sheet for the selected plan.
  const purchasePlan = useCallback(
    async (planId: PlanId): Promise<{ success: boolean; error?: string }> => {
      if (!isNative) {
        return { success: false, error: 'not_native' };
      }

      const product = products[planId];
      if (!product) {
        return { success: false, error: 'product_not_found' };
      }

      setIsPurchasing(true);
      try {
        const { Purchases } = await import('@revenuecat/purchases-capacitor');

        // Refetch offerings to get a live StoreProduct reference (RevenueCat requirement)
        const { offerings } = await Purchases.getOfferings();
        const pkg = offerings?.current?.availablePackages?.find(
          (p) => p.storeProduct.productIdentifier === product.productIdentifier
        );

        if (!pkg) {
          return { success: false, error: 'package_not_found' };
        }

        await Purchases.purchaseStoreProduct({ product: pkg.storeProduct });

        return { success: true };
      } catch (err: unknown) {
        const rcErr = err as { userCancelled?: boolean; message?: string };
        if (rcErr?.userCancelled) {
          return { success: false, error: 'user_cancelled' };
        }
        console.error('[RevenueCat] purchase error:', err);
        return { success: false, error: rcErr?.message ?? 'unknown' };
      } finally {
        setIsPurchasing(false);
      }
    },
    [isNative, products]
  );

  return { isNative, isLoading, isPurchasing, products, purchasePlan, initialize };
}
