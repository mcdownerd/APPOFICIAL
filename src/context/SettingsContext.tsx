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
import { useAuth } from "./AuthContext"; // Import useAuth

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
        // Wait for auth to load and user to be approved
        console.log("SettingsContext: Auth still loading or not approved. Skipping fetch.");
        setIsSettingsLoading(true);
        return;
      }

      if (!restaurantId) {
        // If no restaurant_id, default to true or handle as needed
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
          // Fallback to default or handle error
          if (isMounted) setIsPendingLimitEnabled(true);
        } else if (data) {
          console.log(`SettingsContext: Fetched data for restaurant ${restaurantId}:`, data);
          if (isMounted) setIsPendingLimitEnabled(data.pending_limit_enabled);
        } else {
          // If no data (e.g., restaurant not found or no setting), default to true
          console.log(`SettingsContext: No restaurant entry found for ID ${restaurantId}. Defaulting isPendingLimitEnabled to TRUE.`);
          if (isMounted) setIsPendingLimitEnabled(true);
        }
      } catch (error) {
        console.error("SettingsContext: Error fetching pending limit setting:", error);
        if (isMounted) setIsPendingLimitEnabled(true); // Fallback on network error
      } finally {
        if (isMounted) setIsSettingsLoading(false);
        console.log(`SettingsContext: Final isPendingLimitEnabled state: ${isPendingLimitEnabled}`);
      }
    };

    fetchSetting();

    return () => {
      isMounted = false;
    };
  }, [restaurantId, isAuthLoading, isApproved, isPendingLimitEnabled]); // Added isPendingLimitEnabled to dependencies for log

  const togglePendingLimit = useCallback(async () => {
    if (!restaurantId || (userRole !== 'admin' && userRole !== 'restaurante')) {
      console.warn("SettingsContext: User not authorized or no restaurant_id to toggle setting.");
      return;
    }

    setIsSettingsLoading(true);
    const newValue = !isPendingLimitEnabled;
    console.log(`SettingsContext: Attempting to toggle pending_limit_enabled for restaurant ${restaurantId} to ${newValue}`);
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({ pending_limit_enabled: newValue })
        .eq('id', restaurantId);

      if (error) {
        console.error("SettingsContext: Failed to update pending limit setting:", error);
        throw new Error("Failed to update setting.");
      }

      setIsPendingLimitEnabled(newValue);
      console.log("SettingsContext: Updated pending_limit_enabled to", newValue);
    } catch (error) {
      console.error("SettingsContext: Error updating pending limit setting:", error);
      // Revert UI state if update fails
      setIsPendingLimitEnabled(!newValue);
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