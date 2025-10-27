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
import { RestaurantAPI } from "@/lib/api"; // Importar RestaurantAPI

interface SettingsContextType {
  isPendingLimitEnabled: boolean;
  togglePendingLimit: (newValue: boolean) => Promise<void>; // Ajustado aqui
  isEcranEstafetaEnabled: boolean;
  toggleEcranEstafeta: (newValue: boolean) => Promise<void>; // Ajustado aqui
  isSettingsLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const { user, isLoading: isAuthLoading, isApproved } = useAuth();
  const [isPendingLimitEnabled, setIsPendingLimitEnabled] = useState<boolean>(true);
  const [isEcranEstafetaEnabled, setIsEcranEstafetaEnabled] = useState<boolean>(false);
  const [isSettingsLoading, setIsSettingsLoading] = useState<boolean>(true);

  const loggedInUserRestaurantId = user?.restaurant_id;
  const userRole = user?.user_role;

  // Fetch setting from database for the logged-in user's restaurant
  useEffect(() => {
    let isMounted = true;

    const fetchSetting = async () => {
      if (isAuthLoading || !isApproved) {
        console.log("SettingsContext: Auth still loading or not approved. Skipping fetch.");
        setIsSettingsLoading(true);
        return;
      }

      if (!loggedInUserRestaurantId) {
        console.log("SettingsContext: No restaurant_id found for logged-in user. Defaulting settings to TRUE/FALSE.");
        if (isMounted) {
          setIsPendingLimitEnabled(true);
          setIsEcranEstafetaEnabled(false);
          setIsSettingsLoading(false);
        }
        return;
      }

      console.log(`SettingsContext: Fetching settings for logged-in user's restaurant_id: ${loggedInUserRestaurantId}`);
      setIsSettingsLoading(true);
      try {
        const { data, error } = await supabase
          .from('restaurants')
          .select('pending_limit_enabled, ecran_estafeta_enabled')
          .eq('id', loggedInUserRestaurantId)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
          console.error("SettingsContext: Failed to fetch restaurant settings:", error);
          if (isMounted) {
            setIsPendingLimitEnabled(true); // Fallback to default on error
            setIsEcranEstafetaEnabled(false); // Fallback to default on error
            showError("Failed to load restaurant settings.");
          }
        } else if (data) {
          console.log(`SettingsContext: Fetched data for restaurant ${loggedInUserRestaurantId}:`, data);
          if (isMounted) {
            setIsPendingLimitEnabled(data.pending_limit_enabled);
            setIsEcranEstafetaEnabled(data.ecran_estafeta_enabled);
          }
        } else {
          // If no data (e.g., restaurant not found or no setting), default to true/false and create it
          console.log(`SettingsContext: No restaurant entry found for ID ${loggedInUserRestaurantId}. Creating default setting.`);
          const { data: newRestaurant, error: insertError } = await supabase
            .from('restaurants')
            .insert({ id: loggedInUserRestaurantId, name: `Restaurante ${loggedInUserRestaurantId.substring(0, 4)}`, pending_limit_enabled: true, ecran_estafeta_enabled: false })
            .select('pending_limit_enabled, ecran_estafeta_enabled')
            .single();

          if (insertError) {
            console.error("SettingsContext: Failed to create default restaurant setting:", insertError);
            if (isMounted) {
              setIsPendingLimitEnabled(true); // Fallback to default on error
              setIsEcranEstafetaEnabled(false); // Fallback to default on error
              showError("Failed to initialize restaurant settings.");
            }
          } else if (newRestaurant) {
            console.log(`SettingsContext: Created default setting for restaurant ${loggedInUserRestaurantId}:`, newRestaurant);
            if (isMounted) {
              setIsPendingLimitEnabled(newRestaurant.pending_limit_enabled);
              setIsEcranEstafetaEnabled(newRestaurant.ecran_estafeta_enabled);
            }
          }
        }
      } catch (error) {
        console.error("SettingsContext: Error fetching or creating pending limit setting:", error);
        if (isMounted) {
          setIsPendingLimitEnabled(true); // Fallback on network error
          setIsEcranEstafetaEnabled(false); // Fallback on network error
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

  // These functions are now for external use (e.g., by admin page)
  const togglePendingLimit = useCallback(async (newValue: boolean) => { // Ajustado aqui
    if (!loggedInUserRestaurantId || (userRole !== 'admin' && userRole !== 'restaurante')) { // Only admin or restaurant can change settings
      console.warn("SettingsContext: User not authorized to toggle setting.");
      showError("You are not authorized to change this setting.");
      throw new Error("Unauthorized");
    }
    
    console.log(`SettingsContext: Attempting to toggle pending_limit_enabled for restaurant ${loggedInUserRestaurantId} to ${newValue}`);
    try {
      await RestaurantAPI.update(loggedInUserRestaurantId, { pending_limit_enabled: newValue });
      console.log("SettingsContext: Updated pending_limit_enabled to", newValue);
      setIsPendingLimitEnabled(newValue); // Update local state
    } catch (error) {
      console.error("SettingsContext: Error updating pending limit setting:", error);
      showError("Failed to update setting.");
      throw error;
    }
  }, [loggedInUserRestaurantId, userRole]);

  const toggleEcranEstafeta = useCallback(async (newValue: boolean) => { // Ajustado aqui
    if (!loggedInUserRestaurantId || (userRole !== 'admin' && userRole !== 'restaurante')) { // Only admin or restaurant can change settings
      console.warn("SettingsContext: User not authorized to toggle Ecran Estafeta setting.");
      showError("You are not authorized to change this setting.");
      throw new Error("Unauthorized");
    }

    console.log(`SettingsContext: Attempting to toggle ecran_estafeta_enabled for restaurant ${loggedInUserRestaurantId} to ${newValue}`);
    try {
      await RestaurantAPI.update(loggedInUserRestaurantId, { ecran_estafeta_enabled: newValue });
      console.log("SettingsContext: Updated ecran_estafeta_enabled to", newValue);
      setIsEcranEstafetaEnabled(newValue); // Update local state
    } catch (error) {
      console.error("SettingsContext: Error updating Ecran Estafeta setting:", error);
      showError("Failed to update setting.");
      throw error;
    }
  }, [loggedInUserRestaurantId, userRole]);

  return (
    <SettingsContext.Provider value={{ 
      isPendingLimitEnabled, 
      togglePendingLimit, 
      isEcranEstafetaEnabled,
      toggleEcranEstafeta,
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