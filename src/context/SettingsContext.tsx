"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { showError } from "@/utils/toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RestaurantAPI, Restaurant } from "@/lib/api";

interface SettingsContextType {
  isPendingLimitEnabled: boolean;
  togglePendingLimit: () => Promise<void>;
  isSettingsLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const { user, isLoading: isAuthLoading, isApproved } = useAuth();
  const queryClient = useQueryClient();

  const restaurantId = user?.restaurant_id;
  const userRole = user?.user_role;

  // Use react-query to fetch restaurant settings
  const { data: restaurantSettings, isLoading: isSettingsLoading } = useQuery<Restaurant | null, Error>({
    queryKey: ["restaurantSettings", restaurantId],
    queryFn: async () => {
      if (!restaurantId) {
        console.log("SettingsContext: No restaurant_id found for user. Defaulting isPendingLimitEnabled to TRUE.");
        return null; // No restaurant ID, so no specific settings to fetch
      }

      console.log(`SettingsContext: Fetching pending_limit_enabled for restaurant_id: ${restaurantId}`);
      try {
        const { data, error } = await supabase
          .from('restaurants')
          .select('id, name, pending_limit_enabled, created_at, updated_at')
          .eq('id', restaurantId)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
          console.error("SettingsContext: Failed to fetch pending limit setting:", error);
          showError("Failed to load restaurant settings.");
          return null; // Fallback to default behavior
        } else if (data) {
          console.log(`SettingsContext: Fetched data for restaurant ${restaurantId}:`, data);
          return data;
        } else {
          // If no data (e.g., restaurant not found or no setting), default to true and create it
          console.log(`SettingsContext: No restaurant entry found for ID ${restaurantId}. Creating default setting.`);
          const newRestaurant = await RestaurantAPI.create(restaurantId, `Restaurante ${restaurantId.substring(0, 4)}`);
          return newRestaurant;
        }
      } catch (error) {
        console.error("SettingsContext: Error fetching or creating pending limit setting:", error);
        showError("An unexpected error occurred with restaurant settings.");
        return null;
      }
    },
    enabled: !isAuthLoading && isApproved, // Only run query if auth is loaded and user is approved
    staleTime: Infinity, // Settings don't become stale automatically, rely on Realtime
    initialData: null,
  });

  const isPendingLimitEnabled = restaurantSettings?.pending_limit_enabled ?? true; // Default to true if no settings

  // Supabase Realtime subscription for restaurant settings
  useEffect(() => {
    if (!restaurantId || !isApproved) return;

    console.log(`SettingsContext: Subscribing to realtime changes for restaurant ${restaurantId}`);

    const channel = supabase
      .channel(`restaurant_settings:${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'restaurants',
          filter: `id=eq.${restaurantId}`
        },
        (payload) => {
          console.log('SettingsContext: Realtime update received:', payload);
          queryClient.setQueryData(["restaurantSettings", restaurantId], (oldData: Restaurant | null) => {
            if (oldData) {
              return { ...oldData, ...payload.new };
            }
            return payload.new as Restaurant;
          });
        }
      )
      .subscribe();

    return () => {
      console.log(`SettingsContext: Unsubscribing from realtime changes for restaurant ${restaurantId}`);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, isApproved, queryClient]);

  // Mutation to toggle pending limit
  const toggleMutation = useMutation({
    mutationFn: async () => {
      if (!restaurantId || (userRole !== 'admin' && userRole !== 'restaurante')) {
        console.warn("SettingsContext: User not authorized or no restaurant_id to toggle setting.");
        showError("You are not authorized to change this setting.");
        throw new Error("Unauthorized");
      }

      const newValue = !isPendingLimitEnabled;
      console.log(`SettingsContext: Attempting to toggle pending_limit_enabled for restaurant ${restaurantId} to ${newValue}`);
      const { error } = await supabase
        .from('restaurants')
        .update({ pending_limit_enabled: newValue, updated_at: new Date().toISOString() })
        .eq('id', restaurantId);

      if (error) {
        console.error("SettingsContext: Failed to update pending limit setting:", error);
        showError("Failed to update setting.");
        throw new Error("Failed to update setting.");
      }
      return newValue;
    },
    onMutate: async () => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ["restaurantSettings", restaurantId] });
      const previousSettings = queryClient.getQueryData<Restaurant>(["restaurantSettings", restaurantId]);
      queryClient.setQueryData(["restaurantSettings", restaurantId], (old: Restaurant | null) => {
        if (old) {
          return { ...old, pending_limit_enabled: !old.pending_limit_enabled };
        }
        return old;
      });
      return { previousSettings };
    },
    onError: (err, newTodo, context) => {
      showError("Failed to update setting: " + err.message);
      // Revert optimistic update on error
      queryClient.setQueryData(["restaurantSettings", restaurantId], context?.previousSettings);
    },
    onSettled: () => {
      // Invalidate to refetch if needed, though realtime should handle it
      queryClient.invalidateQueries({ queryKey: ["restaurantSettings", restaurantId] });
    },
  });

  const togglePendingLimit = useCallback(async () => {
    await toggleMutation.mutateAsync();
  }, [toggleMutation]);

  return (
    <SettingsContext.Provider value={{ isPendingLimitEnabled, togglePendingLimit, isSettingsLoading: isSettingsLoading || toggleMutation.isPending }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
};