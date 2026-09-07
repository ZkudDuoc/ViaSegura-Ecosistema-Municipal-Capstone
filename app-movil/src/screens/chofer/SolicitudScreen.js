import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors } from "../../theme";
import PolygonMapPicker from "../../components/PolygonMapPicker";
import CatalogPicker from "../../components/CatalogPicker";
import { crearPermiso } from "../../services/permisoService";
import { listarComunas } from "../../services/catalogService";
import { getApiErrorMessage } from "../../services/api";

function Field({ label, ...inputProps }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.fieldInput} placeholderTextColor={colors.textMuted} {...inputProps} />
    </View>
  );
}

const TIPOS_ACTIVIDAD = [
  { value: "PROGRAMADA", label: "Programada" },
  { value: "EMERGENCIA", label: "Emergencia" },
];

function TipoActividadField({ value, onChange }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Tipo de actividad</Text>
      <View style={styles.chipRow}>
        {TIPOS_ACTIVIDAD.map((opcion) => (
          <Pressable
            key={opcion.value}
            style={[styles.chip, value === opcion.value && styles.chipActive]}
            onPress={() => onChange(opcion.value)}
          >
            <Text style={[styles.chipText, value === opcion.value && styles.chipTextActive]}>
              {opcion.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// El Backend no cierra el anillo del polígono: hay que repetir el primer
// punto al final antes de enviarlo (confirmado probando POST /api/permisos
// contra la base real — geometry contains non-closed rings si no se hace).
function cerrarPoligono(area) {
  if (area.length < 3) return area;
  const [primerPunto] = area;
  return [...area, primerPunto];
}

function DateField({ label, value, onChange }) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable style={styles.fieldInput} onPress={() => setShowPicker(true)}>
        <Text style={value ? styles.dateValue : styles.datePlaceholder}>
          {value ? value.toLocaleString() : "Toca para elegir fecha y hora"}
        </Text>
      </Pressable>
      {showPicker && (
        <DateTimePicker
          value={value ?? new Date()}
          mode="datetime"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, selectedDate) => {
            setShowPicker(false);
            if (selectedDate) onChange(selectedDate);
          }}
        />
      )}
    </View>
  );
}

export default function SolicitudScreen({ navigation }) {
  const [area, setArea] = useState([]);
  const [rutEjecutor, setRutEjecutor] = useState("");
  const [comunaId, setComunaId] = useState("");
  const [tipoActividad, setTipoActividad] = useState("");
  const [alturaEstimada, setAlturaEstimada] = useState("");
  const [ventanaInicio, setVentanaInicio] = useState(null);
  const [ventanaFin, setVentanaFin] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);

  const formularioValido =
    area.length >= 3 && rutEjecutor && comunaId && tipoActividad && ventanaInicio && ventanaFin;

  const handleSubmit = async () => {
    setError(null);
    setResultado(null);
    setLoading(true);
    try {
      const permiso = await crearPermiso({
        rut_ejecutor: rutEjecutor,
        comuna_id: comunaId,
        tipo_actividad: tipoActividad,
        area: cerrarPoligono(area),
        ventana_inicio: ventanaInicio.toISOString(),
        ventana_fin: ventanaFin.toISOString(),
        altura_estimada_m: alturaEstimada ? Number(alturaEstimada) : undefined,
      });
      setResultado(permiso);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Nueva solicitud de circulación</Text>
      <Text style={styles.subheader}>
        Marca el área de trabajo en el mapa y completa los datos de la solicitud.
      </Text>

      <PolygonMapPicker onChange={setArea} />

      <Field
        label="RUT del ejecutor"
        placeholder="12345678-9"
        value={rutEjecutor}
        onChangeText={setRutEjecutor}
      />
      <CatalogPicker label="Comuna" fetcher={listarComunas} value={comunaId} onChange={setComunaId} />
      <TipoActividadField value={tipoActividad} onChange={setTipoActividad} />
      <Field
        label="Altura estimada del vehículo (m)"
        placeholder="Ej: 4.2"
        value={alturaEstimada}
        onChangeText={setAlturaEstimada}
        keyboardType="numeric"
      />
      <DateField label="Inicio de la ventana" value={ventanaInicio} onChange={setVentanaInicio} />
      <DateField label="Fin de la ventana" value={ventanaFin} onChange={setVentanaFin} />

      {error && <Text style={styles.errorText}>{error}</Text>}
      {resultado && (
        <>
          <Text style={styles.successText}>
            Solicitud creada · estado: {resultado.estado ?? "enviada"}
            {resultado.riesgo?.nivel ? ` · riesgo: ${resultado.riesgo.nivel}` : ""}
          </Text>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => navigation.navigate("Geofencing", { permisoId: resultado.id })}
          >
            <Text style={styles.secondaryButtonText}>Confirmar llegada (geofencing + foto)</Text>
          </Pressable>
        </>
      )}

      <Pressable
        style={[styles.submitButton, !formularioValido && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={!formularioValido || loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.surface} />
        ) : (
          <Text style={styles.submitButtonText}>Enviar solicitud</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  header: { fontSize: 22, fontWeight: "700", color: colors.text },
  subheader: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: 20 },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 6 },
  fieldInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
  },
  chipRow: { flexDirection: "row", gap: 10 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: colors.surface },
  dateValue: { color: colors.text, fontSize: 14 },
  datePlaceholder: { color: colors.textMuted, fontSize: 14 },
  errorText: { color: colors.danger, marginBottom: 12, fontSize: 13 },
  successText: { color: colors.success, marginBottom: 12, fontSize: 13, fontWeight: "600" },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  secondaryButtonText: { color: colors.primaryDark, fontWeight: "700", fontSize: 14 },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { color: colors.surface, fontWeight: "700", fontSize: 15 },
});
