import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import MapView, { Marker, Polygon } from "react-native-maps";
import { colors } from "../theme";

const SANTIAGO_REGION = {
  latitude: -33.4489,
  longitude: -70.6693,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

// Devuelve los puntos como [lng, lat] (formato GeoJSON) vía onChange.
export default function PolygonMapPicker({ onChange }) {
  const [points, setPoints] = useState([]);

  const addPoint = (event) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    const next = [...points, { latitude, longitude }];
    setPoints(next);
    onChange(next.map((p) => [p.longitude, p.latitude]));
  };

  const undoLastPoint = () => {
    const next = points.slice(0, -1);
    setPoints(next);
    onChange(next.map((p) => [p.longitude, p.latitude]));
  };

  const reset = () => {
    setPoints([]);
    onChange([]);
  };

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={SANTIAGO_REGION} onPress={addPoint}>
        {points.map((point, index) => (
          <Marker key={index} coordinate={point} />
        ))}
        {points.length >= 3 && (
          <Polygon
            coordinates={points}
            fillColor="rgba(11, 95, 255, 0.25)"
            strokeColor={colors.primary}
            strokeWidth={2}
          />
        )}
      </MapView>

      <View style={styles.footer}>
        <Text style={styles.hint}>
          {points.length < 3
            ? `Toca el mapa para marcar el área (${points.length}/3 puntos mínimo)`
            : `Área definida con ${points.length} puntos`}
        </Text>
        <View style={styles.actions}>
          <Pressable style={styles.actionButton} onPress={undoLastPoint} disabled={!points.length}>
            <Text style={styles.actionText}>Deshacer punto</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={reset} disabled={!points.length}>
            <Text style={styles.actionText}>Reiniciar</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  map: { width: "100%", height: 220 },
  footer: { backgroundColor: colors.surface, padding: 12 },
  hint: { fontSize: 12, color: colors.textMuted, marginBottom: 8 },
  actions: { flexDirection: "row", gap: 10 },
  actionButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionText: { fontSize: 12, fontWeight: "600", color: colors.primaryDark },
});
