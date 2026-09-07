import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { useRole, ROLES } from "../context/RoleContext";
import { colors } from "../theme";

const ROL_BACKEND_A_UI = {
  CHOFER: ROLES.CHOFER,
  LOGISTICA: ROLES.CHOFER,
  INSPECTOR: ROLES.INSPECTOR,
};

export default function LoginScreen() {
  const { login, registrar, loading, error } = useAuth();
  const { setRole, setDemoMode } = useRole();
  const [modo, setModo] = useState("login"); // "login" | "registro"

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [rut, setRut] = useState("");
  const [rol, setRol] = useState("CHOFER");

  const aplicarRolUI = (usuario) => {
    const rolUI = ROL_BACKEND_A_UI[usuario.rol];
    if (!rolUI) {
      throw new Error(`Rol "${usuario.rol}" no está soportado en la app móvil`);
    }
    setRole(rolUI);
  };

  const handleSubmit = async () => {
    try {
      if (modo === "login") {
        const data = await login(email, password);
        aplicarRolUI(data.usuario);
      } else {
        const data = await registrar({ rol, nombre, rut, email, password });
        aplicarRolUI(data.usuario);
      }
    } catch (err) {
      // el error ya queda expuesto vía useAuth().error
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>VíaSegura</Text>
      <Text style={styles.subtitle}>
        {modo === "login" ? "Inicia sesión para continuar" : "Crea tu cuenta"}
      </Text>

      {modo === "registro" && (
        <>
          <Field label="Nombre completo" value={nombre} onChangeText={setNombre} />
          <Field label="RUT" value={rut} onChangeText={setRut} placeholder="12345678-9" />
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Rol</Text>
            <View style={styles.rolOptions}>
              {["CHOFER", "INSPECTOR"].map((opcion) => (
                <Pressable
                  key={opcion}
                  style={[styles.rolChip, rol === opcion && styles.rolChipActive]}
                  onPress={() => setRol(opcion)}
                >
                  <Text style={[styles.rolChipText, rol === opcion && styles.rolChipTextActive]}>
                    {opcion}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </>
      )}

      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Field
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Pressable style={styles.submitButton} onPress={handleSubmit} disabled={loading}>
        {loading ? (
          <ActivityIndicator color={colors.surface} />
        ) : (
          <Text style={styles.submitButtonText}>
            {modo === "login" ? "Iniciar sesión" : "Crear cuenta"}
          </Text>
        )}
      </Pressable>

      <Pressable onPress={() => setModo(modo === "login" ? "registro" : "login")}>
        <Text style={styles.switchModeText}>
          {modo === "login" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
        </Text>
      </Pressable>

      <Pressable onPress={() => setDemoMode(true)}>
        <Text style={styles.demoModeText}>Continuar sin cuenta (modo demo, sin backend)</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({ label, ...inputProps }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.fieldInput} {...inputProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, paddingTop: 80, paddingBottom: 48 },
  title: { fontSize: 32, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 15, color: colors.textMuted, marginTop: 4, marginBottom: 28 },
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
  rolOptions: { flexDirection: "row", gap: 10 },
  rolChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  rolChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  rolChipText: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
  rolChipTextActive: { color: colors.surface },
  errorText: { color: colors.danger, marginBottom: 12, fontSize: 13 },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  submitButtonText: { color: colors.surface, fontWeight: "700", fontSize: 15 },
  switchModeText: {
    color: colors.primary,
    textAlign: "center",
    marginTop: 18,
    fontSize: 13,
    fontWeight: "600",
  },
  demoModeText: {
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 24,
    fontSize: 12,
  },
});
