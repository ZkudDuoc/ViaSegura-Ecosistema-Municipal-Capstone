import { createContext, useContext, useState, useCallback, useEffect } from "react";
import * as authService from "../services/authService";
import { setAuthToken, setUnauthorizedHandler, getApiErrorMessage } from "../services/api";

const AuthContext = createContext(null);

const TOKEN_KEY = "viasegura_chofer_token";

// Web para el lado "privado": choferes y personal de logística, tanto de
// empresas como personas naturales. Los roles municipales usan el dashboard.
const ROLES_PERMITIDOS = ["CHOFER", "LOGISTICA"];

function leerToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function guardarToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Sin storage disponible la sesión igual funciona, solo no sobrevive al refresh.
  }
}

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [token, setToken] = useState(null);
  const [verificando, setVerificando] = useState(() => Boolean(leerToken()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const logout = useCallback(() => {
    setUsuario(null);
    setToken(null);
    setAuthToken(null);
    guardarToken(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Restaurar sesión al refrescar: token guardado -> GET /api/auth/me.
  useEffect(() => {
    const guardado = leerToken();
    if (!guardado) return;

    setAuthToken(guardado);
    authService
      .me()
      .then((perfil) => {
        if (!ROLES_PERMITIDOS.includes(perfil.rol)) {
          logout();
          return;
        }
        setUsuario(perfil);
        setToken(guardado);
      })
      .catch((err) => {
        setAuthToken(null);
        if (err?.response?.status !== 401) {
          setError("No se pudo validar la sesión con el servidor");
        }
      })
      .finally(() => setVerificando(false));
  }, [logout]);

  const abrirSesion = useCallback((data) => {
    setUsuario(data.usuario);
    setToken(data.token);
    setAuthToken(data.token);
    guardarToken(data.token);
  }, []);

  const login = useCallback(
    async (email, password) => {
      setLoading(true);
      setError(null);
      try {
        const data = await authService.login(email, password);
        if (!ROLES_PERMITIDOS.includes(data.usuario.rol)) {
          throw new Error("Esta cuenta no es de chofer ni de empresa");
        }
        abrirSesion(data);
        return data;
      } catch (err) {
        const message = err.response ? getApiErrorMessage(err) : err.message;
        setError(message);
        throw new Error(message);
      } finally {
        setLoading(false);
      }
    },
    [abrirSesion]
  );

  // Crea la cuenta y deja la sesión iniciada con el token que devuelve el Backend.
  const registrar = useCallback(
    async (datos) => {
      setLoading(true);
      setError(null);
      try {
        const data = await authService.registrar(datos);
        abrirSesion(data);
        return data;
      } catch (err) {
        const message =
          err?.response?.status === 409
            ? "Ya existe una cuenta con ese email o RUT"
            : err.response
              ? getApiErrorMessage(err)
              : err.message;
        setError(message);
        throw new Error(message);
      } finally {
        setLoading(false);
      }
    },
    [abrirSesion]
  );

  const limpiarError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{ usuario, token, verificando, loading, error, login, registrar, logout, limpiarError }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}