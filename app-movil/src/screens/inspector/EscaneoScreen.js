import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../theme";

export default function EscaneoScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Escanear QR</Text>
      <Text style={styles.subheader}>
        Mockup — Semana 3 integra expo-camera para lectura real de QR de permisos.
      </Text>
      <View style={styles.scanFrame}>
        <Text style={styles.scanFrameText}>Encuadra el código QR del permiso</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: "center", padding: 24, paddingTop: 48 },
  header: { fontSize: 22, fontWeight: "700", color: colors.text },
  subheader: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 4, marginBottom: 32 },
  scanFrame: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  scanFrameText: { color: colors.textMuted, fontSize: 13, paddingHorizontal: 24, textAlign: "center" },
});
