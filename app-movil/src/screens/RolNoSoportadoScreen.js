import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";

// Resguardo: un usuario autenticado con un rol que la app móvil no maneja
// (ej. OPERADOR_MUNICIPAL, que vive en el dashboard web, no acá).
export default function RolNoSoportadoScreen() {
  const { usuario, logout } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Rol no soportado</Text>
      <Text style={styles.subtitle}>
        Tu cuenta tiene el rol "{usuario?.rol}", que no tiene una vista en la app móvil.
      </Text>
      <Pressable style={styles.button} onPress={logout}>
        <Text style={styles.buttonText}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.text, marginBottom: 8 },
  subtitle: { fontSize: 14, color: colors.textMuted, textAlign: "center", marginBottom: 24 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  buttonText: { color: colors.surface, fontWeight: "700", fontSize: 14 },
});
