import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRole, ROLES } from "../context/RoleContext";
import { colors } from "../theme";

const OPTIONS = [
  {
    role: ROLES.CHOFER,
    title: "Chofer / Logística",
    description: "Crear y hacer seguimiento de solicitudes de circulación.",
  },
  {
    role: ROLES.INSPECTOR,
    title: "Inspector",
    description: "Escanear QR y registrar infracciones en ruta.",
  },
];

export default function RoleSelectScreen() {
  const { setRole } = useRole();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>VíaSegura</Text>
      <Text style={styles.subtitle}>Selecciona tu rol para continuar</Text>

      {OPTIONS.map((option) => (
        <Pressable
          key={option.role}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={() => setRole(option.role)}
        >
          <Text style={styles.cardTitle}>{option.title}</Text>
          <Text style={styles.cardDescription}>{option.description}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    paddingTop: 96,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: 32,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: {
    opacity: 0.7,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 6,
  },
  cardDescription: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
});
