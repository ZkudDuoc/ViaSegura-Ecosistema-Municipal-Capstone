import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import DashboardLayout from "./layouts/DashboardLayout";
import LoginPage from "./pages/LoginPage";
import OperadorPage from "./pages/OperadorPage";
import SupervisorPage from "./pages/SupervisorPage";

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
              <DashboardLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/operador" replace />} />
          <Route path="/operador" element={<OperadorPage />} />
          <Route path="/reporteria" element={<SupervisorPage />} />
          <Route path="/supervisor" element={<Navigate to="/reporteria" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}