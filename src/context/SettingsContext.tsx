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
  togglePendingLimit: () => Promise<void>;
  isEcranEstafetaEnabled: boolean; // Nova propriedade
  toggleEcranEstafeta: () => Promise<void>; // Nova função
  isSettingsLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const { user, isLoading: isAuthLoading, isApproved } = useAuth();
  const [isPendingLimitEnabled, setIsPendingLimitEnabled] = useState<boolean>(true);
  const [isEcranEstafetaEnabled, setIsEcranEstafetaEnabled] = useState<boolean>(false); // Novo estado
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
        console.log("SettingsContext: No restaurant_id found for user. Defaulting settings to TRUE/FALSE.");
        if (isMounted) {
          setIsPendingLimitEnabled(true);
          setIsEcranEstafetaEnabled(false); // Default para false
          setIsSettingsLoading(false);
        }
        return;
      }

      console.log(`SettingsContext: Fetching settings for restaurant_id: ${restaurantId}`);
      setIsSettingsLoading(true);
      try {
        const { data, error } = await supabase
          .from('restaurants')
          .select('pending_limit_enabled, ecran_estafeta_enabled') // Buscar nova coluna
          .eq('id', restaurantId)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
          console.error("SettingsContext: Failed to fetch restaurant settings:", error);
          if (isMounted) {
            setIsPendingLimitEnabled(true); // Fallback to default on error
            setIsEcranEstafetaEnabled(false); // Fallback to default on error
            showError("Failed to load restaurant settings.");
          }
        } else if (data) {
          console.log(`SettingsContext: Fetched data for restaurant ${restaurantId}:`, data);
          if (isMounted) {
            setIsPendingLimitEnabled(data.pending_limit_enabled);
            setIsEcranEstafetaEnabled(data.ecran_estafeta_enabled); // Set new state
          }
        } else {
          // If no data (e.g., restaurant not found or no setting), default to true/false and create it
          console.log(`SettingsContext: No restaurant entry found for ID ${restaurantId}. Creating default setting.`);
          const { data: newRestaurant, error: insertError } = await supabase
            .from('restaurants')
            .insert({ id: restaurantId, name: `Restaurante ${restaurantId.substring(0, 4)}`, pending_limit_enabled: true, ecran_estafeta_enabled: false }) // Default para false
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
            console.log(`SettingsContext: Created default setting for restaurant ${restaurantId}:`, newRestaurant);
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
      await RestaurantAPI.update(restaurantId, { pending_limit_enabled: newValue });

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

  const toggleEcranEstafeta = useCallback(async () => {
    if (!restaurantId || (userRole !== 'admin' && userRole !== 'restaurante')) {
      console.warn("SettingsContext: User not authorized or no restaurant_id to toggle Ecran Estafeta setting.");
      showError("You are not authorized to change this setting.");
      return;
    }

    setIsSettingsLoading(true);
    const newValue = !isEcranEstafetaEnabled;
    console.log(`SettingsContext: Attempting to toggle ecran_estafeta_enabled for restaurant ${restaurantId} to ${newValue}`);
    try {
      await RestaurantAPI.update(restaurantId, { ecran_estafeta_enabled: newValue });

      setIsEcranEstafetaEnabled(newValue);
      console.log("SettingsContext: Updated ecran_estafeta_enabled to", newValue);
    } catch (error) {
      console.error("SettingsContext: Error updating Ecran Estafeta setting:", error);
      // Revert UI state if update fails
      setIsEcranEstafetaEnabled(!newValue);
      showError("Failed to update setting.");
      throw error;
    } finally {
      setIsSettingsLoading(false);
    }
  }, [isEcranEstafetaEnabled, restaurantId, userRole]);

  return (
    <SettingsContext.Provider value={{ 
      isPendingLimitEnabled, 
      togglePendingLimit, 
      isEcranEstafetaEnabled, // Nova propriedade
      toggleEcranEstafeta, // Nova função
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