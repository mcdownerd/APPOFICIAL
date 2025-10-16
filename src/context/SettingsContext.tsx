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
import { showError } from "@/utils/toast"; // Importar showError

interface SettingsContextType {
  isPendingLimitEnabled: boolean;
  togglePendingLimit: () => Promise<void>;
  isSettingsLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const { user, isLoading: isAuthLoading, isApproved } = useAuth();
  const [isPendingLimitEnabled, setIsPendingLimitEnabled] = useState<boolean>(true);
  const [isSettingsLoading, setIsSettingsLoading] = useState<boolean>(true);

  const restaurantId = user?.restaurant_id;
  const userRole = user?.user_role;

  // Fetch setting from database
  useEffect(() => {
    let isMounted = true;

    const fetchSetting = async () => {
      if (isAuthLoading || !isApproved) {
        console.log("SettingsContext: Auth still loading or not approved. Skipping fetch.");
        setIsSettingsLoading(true);
        return;
      }

      if (!restaurantId) {
        console.log("SettingsContext: No restaurant_id found for user. Defaulting isPendingLimitEnabled to TRUE.");
        if (isMounted) {
          setIsPendingLimitEnabled(true);
          setIsSettingsLoading(false);
        }
        return;
      }

      console.log(`SettingsContext: Fetching pending_limit_enabled for restaurant_id: ${restaurantId}`);
      setIsSettingsLoading(true);
      try {
        const { data, error } = await supabase
          .from('restaurants')
          .select('pending_limit_enabled')
          .eq('id', restaurantId)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
          console.error("SettingsContext: Failed to fetch pending limit setting:", error);
          if (isMounted) {
            setIsPendingLimitEnabled(true); // Fallback to default on error
            showError("Failed to load restaurant settings.");
          }
        } else if (data) {
          console.log(`SettingsContext: Fetched data for restaurant ${restaurantId}:`, data);
          if (isMounted) setIsPendingLimitEnabled(data.pending_limit_enabled);
        } else {
          // If no data (e.g., restaurant not found or no setting), default to true and create it
          console.log(`SettingsContext: No restaurant entry found for ID ${restaurantId}. Creating default setting.`);
          const { data: newRestaurant, error: insertError } = await supabase
            .from('restaurants')
            .insert({ id: restaurantId, name: `Restaurante ${restaurantId.substring(0, 4)}`, pending_limit_enabled: true })
            .select('pending_limit_enabled')
            .single();

          if (insertError) {
            console.error("SettingsContext: Failed to create default restaurant setting:", insertError);
            if (isMounted) {
              setIsPendingLimitEnabled(true); // Fallback to default on error
              showError("Failed to initialize restaurant settings.");
            }
          } else if (newRestaurant) {
            console.log(`SettingsContext: Created default setting for restaurant ${restaurantId}:`, newRestaurant);
            if (isMounted) setIsPendingLimitEnabled(newRestaurant.pending_limit_enabled);
          }
        }
      } catch (error) {
        console.error("SettingsContext: Error fetching or creating pending limit setting:", error);
        if (isMounted) {
          setIsPendingLimitEnabled(true); // Fallback on network error
          showError("An unexpected error occurred with restaurant settings.");
        }
      } finally {
        if (isMounted) setIsSettingsLoading(false);
      }
    };

    fetchSetting();

    return () => {
      isMounted = false;
    };
  }, [restaurantId, isAuthLoading, isApproved]); // Removed isPendingLimitEnabled from dependencies to prevent infinite loop

  const togglePendingLimit = useCallback(async () => {
    if (!restaurantId || (userRole !== 'admin' && userRole !== 'restaurante')) {
      console.warn("SettingsContext: User not authorized or no restaurant_id to toggle setting.");
      showError("You are not authorized to change this setting.");
      return;
    }

    setIsSettingsLoading(true);
    const newValue = !isPendingLimitEnabled;
    console.log(`SettingsContext: Attempting to toggle pending_limit_enabled for restaurant ${restaurantId} to ${newValue}`);
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({ pending_limit_enabled: newValue, updated_at: new Date().toISOString() }) // Adicionado updated_at
        .eq('id', restaurantId);

      if (error) {
        console.error("SettingsContext: Failed to update pending limit setting:", error);
        showError("Failed to update setting.");
        throw new Error("Failed to update setting.");
      }

      setIsPendingLimitEnabled(newValue);
      console.log("SettingsContext: Updated pending_limit_enabled to", newValue);
    } catch (error) {
      console.error("SettingsContext: Error updating pending limit setting:", error);
      // Revert UI state if update fails
      setIsPendingLimitEnabled(!newValue);
      showError("Failed to update setting.");
      throw error;
    } finally {
      setIsSettingsLoading(false);
    }
  }, [isPendingLimitEnabled, restaurantId, userRole]);

  return (
    <SettingsContext.Provider value={{ isPendingLimitEnabled, togglePendingLimit, isSettingsLoading }}>
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