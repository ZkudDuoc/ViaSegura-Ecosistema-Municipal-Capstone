import React from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { colors } from "../../theme";

const SOLICITUDES_MOCK = [
  { id: "SOL-1042", estado: "En evaluación", comuna: "Santiago" },
  { id: "SOL-1041", estado: "Aprobada", comuna: "Providencia" },
  { id: "SOL-1039", estado: "Riesgo alto", comuna: "Renca" },
];

function EstadoBadge({ estado }) {
  const palette = {
    "En evaluación": colors.warning,
    Aprobada: colors.success,
    "Riesgo alto": colors.danger,
  };
  return (
    <View style={[styles.badge, { backgroundColor: palette[estado] ?? colors.textMuted }]}>
      <Text style={styles.badgeText}>{estado}</Text>
    </View>
  );
}

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Mis solicitudes</Text>
      <FlatList
        data={SOLICITUDES_MOCK}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View>
              <Text style={styles.itemId}>{item.id}</Text>
              <Text style={styles.itemComuna}>{item.comuna}</Text>
            </View>
            <EstadoBadge estado={item.estado} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 12 },
  header: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  item: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemId: { fontSize: 16, fontWeight: "600", color: colors.text },
  itemComuna: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  badgeText: { color: colors.surface, fontSize: 12, fontWeight: "600" },
});
