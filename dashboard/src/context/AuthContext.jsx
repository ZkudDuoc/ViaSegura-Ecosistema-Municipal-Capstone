import { createContext, useContext, useState, useCallback } from "react";
import * as authService from "../services/authService";
import { setAuthToken, getApiErrorMessage } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const data = await authService.login(email, password);
      setUsuario(data.usuario);
      setToken(data.token);
      setAuthToken(data.token);
      return data;
    } catch (err) {
      const message = getApiErrorMessage(err);
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setUsuario(null);
    setToken(null);
    setAuthToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ usuario, token, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
