"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";

interface SettingsContextType {
  isPendingLimitEnabled: boolean;
  togglePendingLimit: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const LOCAL_STORAGE_PENDING_LIMIT_KEY = "deliveryflow_pending_limit_enabled";

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  // Carrega o estado inicial do localStorage, padrão para true se não encontrado
  const [isPendingLimitEnabled, setIsPendingLimitEnabled] = useState<boolean>(() => {
    try {
      const storedValue = localStorage.getItem(LOCAL_STORAGE_PENDING_LIMIT_KEY);
      const initialValue = storedValue ? JSON.parse(storedValue) : true;
      console.log("SettingsContext: Initializing isPendingLimitEnabled from localStorage:", initialValue);
      return initialValue;
    } catch (error) {
      console.error("SettingsContext: Failed to read pending limit from localStorage:", error);
      return true; // Fallback to true on error
    }
  });

  // Salva o estado no localStorage sempre que ele muda
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_PENDING_LIMIT_KEY, JSON.stringify(isPendingLimitEnabled));
      console.log("SettingsContext: Saved isPendingLimitEnabled to localStorage:", isPendingLimitEnabled);
    } catch (error) {
      console.error("SettingsContext: Failed to save pending limit to localStorage:", error);
    }
  }, [isPendingLimitEnabled]);

  const togglePendingLimit = useCallback(() => {
    console.log("SettingsContext: togglePendingLimit called. Current value:", isPendingLimitEnabled);
    setIsPendingLimitEnabled((prev) => !prev);
  }, [isPendingLimitEnabled]); // Adicionado isPendingLimitEnabled como dependência para o log

  return (
    <SettingsContext.Provider value={{ isPendingLimitEnabled, togglePendingLimit }}>
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