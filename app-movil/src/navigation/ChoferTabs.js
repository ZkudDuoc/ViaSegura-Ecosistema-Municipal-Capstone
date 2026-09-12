import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import HomeScreen from "../screens/chofer/HomeScreen";
import SolicitudStack from "./SolicitudStack";
import PanicoScreen from "../screens/chofer/PanicoScreen";
import { colors } from "../theme";

const Tab = createBottomTabNavigator();

export default function ChoferTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tab.Screen name="Mis solicitudes" component={HomeScreen} />
      <Tab.Screen name="Nueva solicitud" component={SolicitudStack} />
      <Tab.Screen name="Pánico" component={PanicoScreen} />
    </Tab.Navigator>
  );
}
