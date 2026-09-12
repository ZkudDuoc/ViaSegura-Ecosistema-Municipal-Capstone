import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import SolicitudScreen from "../screens/chofer/SolicitudScreen";
import GeofencingScreen from "../screens/chofer/GeofencingScreen";

const Stack = createNativeStackNavigator();

export default function SolicitudStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SolicitudForm" component={SolicitudScreen} />
      <Stack.Screen name="Geofencing" component={GeofencingScreen} />
    </Stack.Navigator>
  );
}
