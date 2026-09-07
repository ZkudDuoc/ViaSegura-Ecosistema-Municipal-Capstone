import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useRole, ROLES } from "../context/RoleContext";
import { useAuth } from "../context/AuthContext";
import LoginScreen from "../screens/LoginScreen";
import RoleSelectScreen from "../screens/RoleSelectScreen";
import ChoferTabs from "./ChoferTabs";
import InspectorTabs from "./InspectorTabs";

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { role, demoMode } = useRole();
  const { usuario } = useAuth();

  // Con login real el rol se autoasigna en LoginScreen; a RoleSelectScreen
  // sólo se llega en modo demo (sin backend, activado desde el propio Login).
  const mostrarLogin = !usuario && !demoMode && !role;
  const mostrarSeleccionRol = !role && demoMode;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {mostrarLogin && <Stack.Screen name="Login" component={LoginScreen} />}
        {mostrarSeleccionRol && (
          <Stack.Screen name="SeleccionRol" component={RoleSelectScreen} />
        )}
        {role === ROLES.CHOFER && <Stack.Screen name="ChoferTabs" component={ChoferTabs} />}
        {role === ROLES.INSPECTOR && <Stack.Screen name="InspectorTabs" component={InspectorTabs} />}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
