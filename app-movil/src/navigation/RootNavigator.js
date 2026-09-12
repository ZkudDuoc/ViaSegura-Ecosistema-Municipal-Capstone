import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useRole, ROLES, rolBackendAUI } from "../context/RoleContext";
import { useAuth } from "../context/AuthContext";
import LoginScreen from "../screens/LoginScreen";
import RoleSelectScreen from "../screens/RoleSelectScreen";
import RolNoSoportadoScreen from "../screens/RolNoSoportadoScreen";
import ChoferTabs from "./ChoferTabs";
import InspectorTabs from "./InspectorTabs";

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { role: rolDemo, demoMode } = useRole();
  const { usuario } = useAuth();

  // El rol efectivo se deriva siempre de `usuario` (login real) o de
  // `rolDemo` (modo demo) en el mismo render — nunca depende de un segundo
  // setState posterior, así el navigator nunca se queda sin pantallas.
  const role = usuario ? rolBackendAUI(usuario.rol) : rolDemo;

  const mostrarLogin = !usuario && !demoMode && !role;
  const mostrarSeleccionRol = !role && demoMode;
  const rolNoSoportado = Boolean(usuario) && !role;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {mostrarLogin && <Stack.Screen name="Login" component={LoginScreen} />}
        {mostrarSeleccionRol && (
          <Stack.Screen name="SeleccionRol" component={RoleSelectScreen} />
        )}
        {rolNoSoportado && (
          <Stack.Screen name="RolNoSoportado" component={RolNoSoportadoScreen} />
        )}
        {role === ROLES.CHOFER && <Stack.Screen name="ChoferTabs" component={ChoferTabs} />}
        {role === ROLES.INSPECTOR && <Stack.Screen name="InspectorTabs" component={InspectorTabs} />}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
