import React, { useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { colors } from "../theme";
import { buildPolygonMapHtml } from "./polygonMapHtml";

const HTML = buildPolygonMapHtml();

// Devuelve los puntos como [lng, lat] (formato GeoJSON) vía onChange.
export default function PolygonMapPicker({ onChange }) {
  const webviewRef = useRef(null);
  const [points, setPoints] = useState([]);

  const handleMessage = (event) => {
    try {
      const next = JSON.parse(event.nativeEvent.data);
      setPoints(next);
      onChange(next);
    } catch (err) {
      // ignora mensajes que no vengan del script del mapa
    }
  };

  const undoLastPoint = () => {
    webviewRef.current?.injectJavaScript("window.undoPoint && window.undoPoint(); true;");
  };

  const reset = () => {
    webviewRef.current?.injectJavaScript("window.resetPoints && window.resetPoints(); true;");
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        style={styles.map}
        originWhitelist={["*"]}
        source={{ html: HTML }}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
      />

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
