import React from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { RoleProvider } from "./src/context/RoleContext";
import { AuthProvider } from "./src/context/AuthContext";
import RootNavigator from "./src/navigation/RootNavigator";

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <RoleProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </RoleProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
