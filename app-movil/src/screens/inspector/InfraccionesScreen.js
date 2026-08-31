import React from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { colors } from "../../theme";

const INFRACCIONES_MOCK = [
  { id: "INF-021", tipo: "Circulación sin permiso vigente", fecha: "30-08-2026" },
  { id: "INF-020", tipo: "Desvío de ruta autorizada", fecha: "28-08-2026" },
];

export default function InfraccionesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Infracciones registradas</Text>
      <FlatList
        data={INFRACCIONES_MOCK}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.itemId}>{item.id}</Text>
            <Text style={styles.itemTipo}>{item.tipo}</Text>
            <Text style={styles.itemFecha}>{item.fecha}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 12 },
  header: { fontSize: 22, fontWeight: "700", color: colors.text, paddingHorizontal: 20, marginBottom: 12 },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  item: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemId: { fontSize: 14, fontWeight: "700", color: colors.text },
  itemTipo: { fontSize: 14, color: colors.text, marginTop: 4 },
  itemFecha: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
});
