import React, { createContext, useContext, useState } from "react";

export const ROLES = {
  CHOFER: "chofer",
  INSPECTOR: "inspector",
};

// Valores reales del enum rol_usuario en la base -> rol de navegación de la
// app. Única fuente de verdad: derivar el rol siempre desde `usuario.rol`
// evita depender de un setRole() separado que puede ejecutarse en un
// render distinto al de setUsuario() y dejar al navigator sin pantallas
// por una fracción de segundo (bug real, visto en dispositivo).
const ROL_BACKEND_A_UI = {
  CHOFER: ROLES.CHOFER,
  LOGISTICA: ROLES.CHOFER,
  INSPECTOR_MUNICIPAL: ROLES.INSPECTOR,
};

export function rolBackendAUI(rolBackend) {
  return ROL_BACKEND_A_UI[rolBackend] ?? null;
}

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
