import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import DashboardLayout from "./layouts/DashboardLayout";
import LoginPage from "./pages/LoginPage";
import OperadorPage from "./pages/OperadorPage";
import SolicitudDetallePage from "./pages/SolicitudDetallePage";
import MultasPage from "./pages/MultasPage";
import ReporteriaPage from "./pages/ReporteriaPage";

// Ruta protegida: mientras se valida el token guardado no se muestra nada;
// sin sesión se manda a /login recordando a dónde quería ir.
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
              <SocketProvider>
                <DashboardLayout />
              </SocketProvider>
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/operador" replace />} />
          <Route path="/operador" element={<OperadorPage />} />
          <Route path="/solicitudes/:id" element={<SolicitudDetallePage />} />
          <Route path="/multas" element={<MultasPage />} />
          <Route path="/reporteria" element={<ReporteriaPage />} />
          <Route path="/supervisor" element={<Navigate to="/reporteria" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}