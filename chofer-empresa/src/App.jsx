import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AppLayout from "./layouts/AppLayout";
import LoginPage from "./pages/LoginPage";
import RegistroPage from "./pages/RegistroPage";
import HomePage from "./pages/HomePage";
import SolicitudPage from "./pages/SolicitudPage";
import LlegadaPage from "./pages/LlegadaPage";
import PanicoPage from "./pages/PanicoPage";
import CamionesPage from "./pages/CamionesPage";

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
        <Route path="/registro" element={<RegistroPage />} />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="/solicitud" element={<SolicitudPage />} />
          <Route path="/camiones" element={<CamionesPage />} />
          <Route path="/solicitudes/:id/llegada" element={<LlegadaPage />} />
          <Route path="/panico" element={<PanicoPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}