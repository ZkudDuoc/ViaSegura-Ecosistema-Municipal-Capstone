import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { colors } from "../theme";

// Selector genérico por chips para catálogos chicos (comunas, empresas).
// `fetcher` debe devolver una lista de objetos con `id` y `nombre`.
export default function CatalogPicker({ label, fetcher, value, onChange }) {
  const [opciones, setOpciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let activo = true;
    fetcher()
      .then((data) => {
        if (activo) setOpciones(data);
      })
      .catch(() => {
        if (activo) setError(`No se pudo cargar ${label.toLowerCase()}`);
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [fetcher, label]);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {loading && <ActivityIndicator color={colors.primary} style={styles.loading} />}
      {error && <Text style={styles.errorText}>{error}</Text>}
      {!loading && !error && (
        <View style={styles.chipRow}>
          {opciones.map((opcion) => (
            <Pressable
              key={opcion.id}
              style={[styles.chip, value === opcion.id && styles.chipActive]}
              onPress={() => onChange(opcion.id)}
            >
              <Text style={[styles.chipText, value === opcion.id && styles.chipTextActive]}>
                {opcion.nombre}
              </Text>
            </Pressable>
          ))}
          {opciones.length === 0 && <Text style={styles.emptyText}>Sin opciones registradas</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 6 },
  loading: { alignSelf: "flex-start", marginTop: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: colors.surface },
  errorText: { color: colors.danger, fontSize: 12 },
  emptyText: { color: colors.textMuted, fontSize: 12 },
});
