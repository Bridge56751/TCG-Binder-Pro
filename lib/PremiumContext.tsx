import React, { createContext, useContext } from "react";

export const PremiumContext = createContext<boolean>(false);

export function usePremiumStatus(): boolean {
  return useContext(PremiumContext);
}
