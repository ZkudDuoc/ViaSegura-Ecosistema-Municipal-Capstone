import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { colors } from "../../theme";
import { activarPermiso } from "../../services/permisoService";
import { getApiErrorMessage } from "../../services/api";

export default function GeofencingScreen({ route }) {
  const { permisoId } = route.params ?? {};
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  const [ubicacion, setUbicacion] = useState(null);
  const [foto, setFoto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [confirmado, setConfirmado] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Se requiere permiso de ubicación para confirmar la llegada");
        return;
      }
      const posicion = await Location.getCurrentPositionAsync({});
      setUbicacion(posicion.coords);
    })();
  }, []);

  const tomarFoto = async () => {
    if (!cameraRef.current) return;
    const picture = await cameraRef.current.takePictureAsync();
    setFoto(picture);
  };

  const confirmarLlegada = async () => {
    if (!foto || !permisoId) return;
    setLoading(true);
    setError(null);
    try {
      // La app no tiene un backend de almacenamiento de imágenes todavía; se
      // envía la URI local como evidencia hasta que exista un endpoint de
      // subida de archivos en el Backend Core.
      await activarPermiso(permisoId, foto.uri);
      setConfirmado(true);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (!permisoId) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>No se especificó la solicitud a confirmar</Text>
      </View>
    );
  }

  if (!cameraPermission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!cameraPermission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>Necesitamos acceso a la cámara para la evidencia fotográfica</Text>
        <Pressable style={styles.submitButton} onPress={requestCameraPermission}>
          <Text style={styles.submitButtonText}>Dar permiso</Text>
        </Pressable>
      </View>
    );
  }

  if (confirmado) {
    return (
      <View style={styles.center}>
        <Text style={styles.successText}>Llegada confirmada. Permiso activo.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Geofencing + foto</Text>
      <Text style={styles.hint}>
        {ubicacion
          ? `Ubicación registrada: ${ubicacion.latitude.toFixed(5)}, ${ubicacion.longitude.toFixed(5)}`
          : "Obteniendo ubicación…"}
      </Text>

      <View style={styles.cameraBox}>
        {foto ? (
          <View style={styles.previewBox}>
            <Text style={styles.hint}>Foto capturada</Text>
          </View>
        ) : (
          <CameraView style={styles.camera} ref={cameraRef} facing="back" />
        )}
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {!foto ? (
        <Pressable style={styles.submitButton} onPress={tomarFoto} disabled={!ubicacion}>
          <Text style={styles.submitButtonText}>Tomar foto de evidencia</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.submitButton} onPress={confirmarLlegada} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.submitButtonText}>Confirmar llegada</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  header: { fontSize: 22, fontWeight: "700", color: colors.text, marginBottom: 4 },
  hint: { fontSize: 13, color: colors.textMuted, marginBottom: 16, textAlign: "center" },
  cameraBox: {
    height: 320,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  camera: { flex: 1 },
  previewBox: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: { color: colors.danger, marginBottom: 12, fontSize: 13, textAlign: "center" },
  successText: { color: colors.success, fontSize: 16, fontWeight: "700" },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  submitButtonText: { color: colors.surface, fontWeight: "700", fontSize: 15 },
});
