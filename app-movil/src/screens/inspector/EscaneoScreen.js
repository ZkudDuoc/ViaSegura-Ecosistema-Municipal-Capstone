import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { colors } from "../../theme";

export default function EscaneoScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [escaneado, setEscaneado] = useState(null);

  const handleBarcodeScanned = ({ data }) => {
    // Bloquea la cámara tras el primer escaneo para no disparar el evento
    // en bucle mientras el QR sigue dentro del encuadre.
    if (escaneado) return;
    setEscaneado(data);
  };

  const escanearOtro = () => setEscaneado(null);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>Necesitamos acceso a la cámara para escanear el QR del permiso</Text>
        <Pressable style={styles.submitButton} onPress={requestPermission}>
          <Text style={styles.submitButtonText}>Dar permiso</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Escanear QR</Text>
      <Text style={styles.subheader}>
        {escaneado
          ? "Código leído — pendiente de verificar contra el Backend cuando exista el endpoint."
          : "Encuadra el código QR del permiso"}
      </Text>

      <View style={styles.cameraBox}>
        {escaneado ? (
          <View style={styles.resultBox}>
            <Text style={styles.resultLabel}>Código escaneado:</Text>
            <Text style={styles.resultValue}>{escaneado}</Text>
          </View>
        ) : (
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={handleBarcodeScanned}
          />
        )}
      </View>

      {escaneado && (
        <Pressable style={styles.submitButton} onPress={escanearOtro}>
          <Text style={styles.submitButtonText}>Escanear otro</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: "center", padding: 24, paddingTop: 48 },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  header: { fontSize: 22, fontWeight: "700", color: colors.text },
  subheader: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 4, marginBottom: 32 },
  hint: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
  cameraBox: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: "dashed",
  },
  camera: { flex: 1 },
  resultBox: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    gap: 8,
  },
  resultLabel: { fontSize: 13, color: colors.textMuted },
  resultValue: { fontSize: 14, color: colors.text, fontWeight: "700", textAlign: "center" },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    marginTop: 24,
    width: "100%",
  },
  submitButtonText: { color: colors.surface, fontWeight: "700", fontSize: 15 },
});     