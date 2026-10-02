import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AppLayout from "./layouts/AppLayout";
import LoginPage from "./pages/LoginPage";
import EscanearPage from "./pages/EscanearPage";
import PermisoPage from "./pages/PermisoPage";
import MultasPage from "./pages/MultasPage";
import NuevaMultaPage from "./pages/NuevaMultaPage";
import InspeccionPage from "./pages/InspeccionPage";

function RequireAuth({ children }) {
  const { usuario, verificando } = useAuth();
  const location = useLocation();

  if (verificando) return <div className="pantalla-cargando">Verificando sesión…</div>;
  if (!usuario) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<EscanearPage />} />
          <Route path="/permisos/:id" element={<PermisoPage />} />
          <Route path="/permisos/:id/inspeccion" element={<InspeccionPage />} />
          <Route path="/multas" element={<MultasPage />} />
          <Route path="/multas/nueva" element={<NuevaMultaPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}