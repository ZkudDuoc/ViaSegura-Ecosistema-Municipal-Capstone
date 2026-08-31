import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useRole, ROLES } from "../context/RoleContext";
import RoleSelectScreen from "../screens/RoleSelectScreen";
import ChoferTabs from "./ChoferTabs";
import InspectorTabs from "./InspectorTabs";

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { role } = useRole();

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!role && <Stack.Screen name="SeleccionRol" component={RoleSelectScreen} />}
        {role === ROLES.CHOFER && <Stack.Screen name="ChoferTabs" component={ChoferTabs} />}
        {role === ROLES.INSPECTOR && <Stack.Screen name="InspectorTabs" component={InspectorTabs} />}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
