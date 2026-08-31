import React, { createContext, useContext, useState } from "react";

export const ROLES = {
  CHOFER: "chofer",
  INSPECTOR: "inspector",
};

const RoleContext = createContext(null);

export function RoleProvider({ children }) {
  const [role, setRole] = useState(null);

  return (
    <RoleContext.Provider value={{ role, setRole }}>
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
