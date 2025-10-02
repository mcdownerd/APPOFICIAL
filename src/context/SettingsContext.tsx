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
      return storedValue ? JSON.parse(storedValue) : true;
    } catch (error) {
      console.error("Failed to read pending limit from localStorage:", error);
      return true; // Fallback to true on error
    }
  });

  // Salva o estado no localStorage sempre que ele muda
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_PENDING_LIMIT_KEY, JSON.stringify(isPendingLimitEnabled));
    } catch (error) {
      console.error("Failed to save pending limit to localStorage:", error);
    }
  }, [isPendingLimitEnabled]);

  const togglePendingLimit = useCallback(() => {
    setIsPendingLimitEnabled((prev) => !prev);
  }, []);

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