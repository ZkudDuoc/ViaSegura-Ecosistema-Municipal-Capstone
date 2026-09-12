import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { colors } from "../../theme";
import { listarPermisos } from "../../services/permisoService";
import { getApiErrorMessage } from "../../services/api";

const ESTADO_COLOR = {
  PENDIENTE_CONFIRMACION_MUNICIPAL: colors.warning,
  APROBADO: colors.success,
  EN_COLA_ESPERA: colors.warning,
  ACTIVO: colors.success,
  ACTIVO_PENDIENTE_EVIDENCIA: colors.warning,
  FINALIZADO: colors.textMuted,
  EXPIRADO: colors.danger,
  REVOCADO: colors.danger,
};

function EstadoBadge({ estado }) {
  return (
    <View style={[styles.badge, { backgroundColor: ESTADO_COLOR[estado] ?? colors.textMuted }]}>
      <Text style={styles.badgeText}>{estado}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const cargar = useCallback(() => {
    setError(null);
    return listarPermisos()
      .then(setSolicitudes)
      .catch((err) => setError(getApiErrorMessage(err)));
  }, []);

  useEffect(() => {
    cargar().finally(() => setLoading(false));
  }, [cargar]);

  const onRefresh = () => {
    setRefreshing(true);
    cargar().finally(() => setRefreshing(false));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Mis solicitudes</Text>

      {loading && <ActivityIndicator color={colors.primary} style={styles.loading} />}
      {error && <Text style={styles.errorText}>{error}</Text>}

      {!loading && !error && (
        <FlatList
          data={solicitudes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={styles.emptyText}>Todavía no creaste ninguna solicitud</Text>}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemId}>{item.rut_ejecutor}</Text>
                <Text style={styles.itemComuna}>
                  {item.tipo_actividad}
                  {item.riesgo ? ` · riesgo ${item.riesgo}` : ""}
                </Text>
              </View>
              <EstadoBadge estado={item.estado} />
            </View>
          )}
        />
      )}
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
  loading: { marginTop: 24 },
  errorText: { color: colors.danger, paddingHorizontal: 20, fontSize: 13 },
  emptyText: { color: colors.textMuted, paddingHorizontal: 20, fontSize: 13 },
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
  itemInfo: { flex: 1, marginRight: 12 },
  itemId: { fontSize: 16, fontWeight: "600", color: colors.text },
  itemComuna: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  badgeText: { color: colors.surface, fontSize: 11, fontWeight: "600" },
});
