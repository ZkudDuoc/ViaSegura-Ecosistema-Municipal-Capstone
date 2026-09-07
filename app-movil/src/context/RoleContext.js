import React, { createContext, useContext, useState } from "react";

export const ROLES = {
  CHOFER: "chofer",
  INSPECTOR: "inspector",
};

const RoleContext = createContext(null);

export function RoleProvider({ children }) {
  const [role, setRole] = useState(null);
  // Permite previsualizar la UI por rol sin pasar por login (sin backend real).
  const [demoMode, setDemoMode] = useState(false);

  return (
    <RoleContext.Provider value={{ role, setRole, demoMode, setDemoMode }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) {
    throw new Error("useRole debe usarse dentro de <RoleProvider>");
  }
  return ctx;
}
