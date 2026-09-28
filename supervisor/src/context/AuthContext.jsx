import { createContext, useContext, useState, useCallback, useEffect } from "react";
import * as authService from "../services/authService";
import { setAuthToken, setUnauthorizedHandler, getApiErrorMessage } from "../services/api";

const AuthContext = createContext(null);

const TOKEN_KEY = "viasegura_supervisor_token";

// App de fiscalización en terreno: solo supervisores municipales
// (en el backend el rol se llama INSPECTOR_MUNICIPAL).
const ROLES_PERMITIDOS = ["INSPECTOR_MUNICIPAL"];

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

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const data = await authService.login(email, password);
      if (!ROLES_PERMITIDOS.includes(data.usuario.rol)) {
        throw new Error("Esta cuenta no es de supervisor municipal");
      }
      setUsuario(data.usuario);
      setToken(data.token);
      setAuthToken(data.token);
      guardarToken(data.token);
      return data;
    } catch (err) {
      const message = err.response ? getApiErrorMessage(err) : err.message;
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ usuario, token, verificando, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}