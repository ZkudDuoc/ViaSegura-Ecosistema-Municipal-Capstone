import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import * as Location from "expo-location";
import { colors } from "../../theme";
import { useAuth } from "../../context/AuthContext";
import {
  connectPanicoSocket,
  emitPanico,
  disconnectPanicoSocket,
} from "../../services/panicoSocket";

// "idle" | "enviando" | "confirmado" | "error"
export default function PanicoScreen() {
  const { usuario, token } = useAuth();
  const [estado, setEstado] = useState("idle");
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    const socket = connectPanicoSocket(token);

    socket.on("panico:confirmado", () => {
      setEstado("confirmado");
      setMensaje("Alerta recibida por el centro de control");
    });
    socket.on("panico:error", (payload) => {
      setEstado("error");
      setMensaje(payload?.error ?? "El servidor rechazó la alerta");
    });
    socket.on("connect_error", () => {
      setEstado("error");
      setMensaje("No se pudo conectar al Backend");
    });

    return () => {
      disconnectPanicoSocket();
    };
  }, [token]);

  const enviarPanico = async () => {
    setEstado("enviando");
    setMensaje(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let ubicacion = null;
      if (status === "granted") {
        const posicion = await Location.getCurrentPositionAsync({});
        ubicacion = { lat: posicion.coords.latitude, lng: posicion.coords.longitude };
      }
      emitPanico({
        usuarioId: usuario?.id ?? "demo",
        nombre: usuario?.nombre ?? "Usuario demo",
        ubicacion,
      });
    } catch (err) {
      setEstado("error");
      setMensaje("No se pudo obtener la ubicación");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Botón de pánico</Text>
      <Text style={styles.subheader}>
        Envía tu ubicación en tiempo real al centro de control por WebSocket.
      </Text>

      <Pressable style={styles.panicButton} onPress={enviarPanico} disabled={estado === "enviando"}>
        {estado === "enviando" ? (
          <ActivityIndicator color={colors.surface} size="large" />
        ) : (
          <Text style={styles.panicButtonText}>SOS</Text>
        )}
      </Pressable>

      {mensaje && (
        <Text style={[styles.statusText, estado === "error" && styles.statusTextError]}>
          {mensaje}
        </Text>
      )}
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
  statusText: { marginTop: 24, fontSize: 14, color: colors.success, fontWeight: "600" },
  statusTextError: { color: colors.danger },
});
