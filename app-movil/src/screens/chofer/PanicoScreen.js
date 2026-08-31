import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { colors } from "../../theme";

export default function PanicoScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Botón de pánico</Text>
      <Text style={styles.subheader}>
        Semana 2 conecta este botón por WebSocket al Backend.
      </Text>
      <Pressable style={styles.panicButton}>
        <Text style={styles.panicButtonText}>SOS</Text>
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
  header: { fontSize: 22, fontWeight: "700", color: colors.text, marginBottom: 4 },
  subheader: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginBottom: 40 },
  panicButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  panicButtonText: { color: colors.surface, fontSize: 28, fontWeight: "800" },
});
