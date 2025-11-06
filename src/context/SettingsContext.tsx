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
import { RestaurantAPI } from "@/lib/api";

interface SettingsContextType {
  isPendingLimitEnabled: boolean;
  togglePendingLimit: (newValue: boolean) => Promise<void>;
  isSettingsLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const { user, isLoading: isAuthLoading, isApproved } = useAuth();
  const [isPendingLimitEnabled, setIsPendingLimitEnabled] = useState<boolean>(true);
  const [isSettingsLoading, setIsSettingsLoading] = useState<boolean>(true);

  const loggedInUserRestaurantId = user?.restaurant_id;
  const userRole = user?.user_role;

  useEffect(() => {
    let isMounted = true;

    const fetchSetting = async () => {
      if (isAuthLoading || !isApproved) {
        console.log("SettingsContext: Auth still loading or not approved. Skipping fetch.");
        setIsSettingsLoading(true);
        return;
      }

      if (!loggedInUserRestaurantId) {
        console.log("SettingsContext: No restaurant_id found for logged-in user. Defaulting settings to TRUE.");
        if (isMounted) {
          setIsPendingLimitEnabled(true);
          setIsSettingsLoading(false);
        }
        return;
      }

      console.log(`SettingsContext: Fetching settings for logged-in user's restaurant_id: ${loggedInUserRestaurantId}`);
      setIsSettingsLoading(true);
      try {
        const { data, error } = await supabase
          .from('restaurants')
          .select('pending_limit_enabled')
          .eq('id', loggedInUserRestaurantId)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error("SettingsContext: Failed to fetch restaurant settings:", error);
          if (isMounted) {
            setIsPendingLimitEnabled(true);
            showError("Failed to load restaurant settings.");
          }
        } else if (data) {
          console.log(`SettingsContext: Fetched data for restaurant ${loggedInUserRestaurantId}:`, data);
          if (isMounted) {
            setIsPendingLimitEnabled(data.pending_limit_enabled);
          }
        } else {
          console.log(`SettingsContext: No restaurant entry found for ID ${loggedInUserRestaurantId}. Creating default setting.`);
          const { data: newRestaurant, error: insertError } = await supabase
            .from('restaurants')
            .insert({ id: loggedInUserRestaurantId, name: `Restaurante ${loggedInUserRestaurantId.substring(0, 4)}`, pending_limit_enabled: true })
            .select('pending_limit_enabled')
            .single();

          if (insertError) {
            console.error("SettingsContext: Failed to create default restaurant setting:", insertError);
            if (isMounted) {
              setIsPendingLimitEnabled(true);
              showError("Failed to initialize restaurant settings.");
            }
          } else if (newRestaurant) {
            console.log(`SettingsContext: Created default setting for restaurant ${loggedInUserRestaurantId}:`, newRestaurant);
            if (isMounted) {
              setIsPendingLimitEnabled(newRestaurant.pending_limit_enabled);
            }
          }
        }
      } catch (error) {
        console.error("SettingsContext: Error fetching or creating pending limit setting:", error);
        if (isMounted) {
          setIsPendingLimitEnabled(true);
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
  }, [loggedInUserRestaurantId, isAuthLoading, isApproved]);

  const togglePendingLimit = useCallback(async (newValue: boolean) => {
    if (!loggedInUserRestaurantId || (userRole !== 'admin' && userRole !== 'restaurante')) {
      console.warn("SettingsContext: User not authorized to toggle setting.");
      showError("You are not authorized to change this setting.");
      throw new Error("Unauthorized");
    }
    
    console.log(`SettingsContext: Attempting to toggle pending_limit_enabled for restaurant ${loggedInUserRestaurantId} to ${newValue}`);
    try {
      await RestaurantAPI.update(loggedInUserRestaurantId, { pending_limit_enabled: newValue });
      console.log("SettingsContext: Updated pending_limit_enabled to", newValue);
      setIsPendingLimitEnabled(newValue);
    } catch (error) {
      console.error("SettingsContext: Error updating pending limit setting:", error);
      showError("Failed to update setting.");
      throw error;
    }
  }, [loggedInUserRestaurantId, userRole]);

  return (
    <SettingsContext.Provider value={{ 
      isPendingLimitEnabled, 
      togglePendingLimit, 
      isSettingsLoading 
    }}>
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