import { useQuery } from '@tanstack/react-query';
import type { PurchasesOffering } from 'react-native-purchases';

import { fetchCurrentOffering, isBillingConfigurable } from './purchases';

/**
 * Fetches the current RevenueCat offering for display.
 *
 * Presentation only — nothing here decides access (CLAUDE.md §6). Prices come
 * from the store already localised and currency-formatted, so they are NOT run
 * through ils(): the store knows what a user in a given storefront pays better
 * than we do.
 */
export function useOfferings() {
  return useQuery<PurchasesOffering | null>({
    queryKey: ['billing', 'currentOffering'],
    queryFn: fetchCurrentOffering,
    enabled: isBillingConfigurable(),
    // Prices change rarely and a paywall that refetches on every open feels
    // slow. An hour is well inside how fast a price change needs to land.
    staleTime: 60 * 60 * 1000,
  });
}
