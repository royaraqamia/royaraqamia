'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

type ServiceTab = 'merchants' | 'students';

interface UIContextType {
  isReviewSheetOpen: boolean;
  setIsReviewSheetOpen: (isOpen: boolean) => void;
  activeServicesTab: ServiceTab;
  setActiveServicesTab: (tab: ServiceTab) => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: ReactNode }) {
  const [isReviewSheetOpen, setIsReviewSheetOpen] = useState(false);
  const [activeServicesTab, setActiveServicesTab] = useState<ServiceTab>('merchants');

  return (
    <UIContext.Provider
      value={{
        isReviewSheetOpen,
        setIsReviewSheetOpen,
        activeServicesTab,
        setActiveServicesTab,
      }}
    >
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
}
