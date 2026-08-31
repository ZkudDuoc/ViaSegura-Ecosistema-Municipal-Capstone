import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { colors } from "../../theme";

function Field({ label, placeholder }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldInput}>
        <Text style={styles.fieldPlaceholder}>{placeholder}</Text>
      </View>
    </View>
  );
}

export default function SolicitudScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Nueva solicitud de circulación</Text>
      <Text style={styles.subheader}>
        Mockup — Semana 2 conecta este formulario a la API real.
      </Text>

      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapPlaceholderText}>Mapa: dibujar polígono GeoJSON de la ruta</Text>
      </View>

      <Field label="Tipo de actividad" placeholder="Ej: Transporte de carga general" />
      <Field label="Comuna de origen" placeholder="Ej: Santiago" />
      <Field label="Altura estimada del vehículo" placeholder="Ej: 4.2 m" />
      <Field label="Fecha y hora de circulación" placeholder="Ej: 02-09-2026, 09:00" />

      <Pressable style={styles.submitButton}>
        <Text style={styles.submitButtonText}>Enviar solicitud</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  header: { fontSize: 22, fontWeight: "700", color: colors.text },
  subheader: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: 20 },
  mapPlaceholder: {
    height: 160,
    borderRadius: 14,
    backgroundColor: "#DCE6F7",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  mapPlaceholderText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: "500",
    paddingHorizontal: 24,
    textAlign: "center",
  },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 6 },
  fieldInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  fieldPlaceholder: { color: colors.textMuted, fontSize: 14 },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  submitButtonText: { color: colors.surface, fontWeight: "700", fontSize: 15 },
});
