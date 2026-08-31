import React from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { RoleProvider } from "./src/context/RoleContext";
import RootNavigator from "./src/navigation/RootNavigator";

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RoleProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </RoleProvider>
    </GestureHandlerRootView>
  );
}
