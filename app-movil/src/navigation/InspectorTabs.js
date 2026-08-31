import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import EscaneoScreen from "../screens/inspector/EscaneoScreen";
import InfraccionesScreen from "../screens/inspector/InfraccionesScreen";
import { colors } from "../theme";

const Tab = createBottomTabNavigator();

export default function InspectorTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tab.Screen name="Escanear QR" component={EscaneoScreen} />
      <Tab.Screen name="Infracciones" component={InfraccionesScreen} />
    </Tab.Navigator>
  );
}
