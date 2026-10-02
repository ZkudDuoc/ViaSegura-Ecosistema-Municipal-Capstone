import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ChoferProvider } from "./context/ChoferContext";
import AppLayout from "./layouts/AppLayout";
import LoginPage from "./pages/LoginPage";
import RegistroPage from "./pages/RegistroPage";
import HomePage from "./pages/HomePage";
import SolicitudPage from "./pages/SolicitudPage";
import DetallePage from "./pages/DetallePage";
import CamionesPage from "./pages/CamionesPage";
import ChoferCodigoPage from "./pages/chofer/ChoferCodigoPage";
import ChoferInicioPage from "./pages/chofer/ChoferInicioPage";
import ChoferEvidenciaPage from "./pages/chofer/ChoferEvidenciaPage";

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
      <ChoferProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registro" element={<RegistroPage />} />

          {/* Vista del chofer: entra con código, sin cuenta de empresa. Pánico y
              evidencia viven solo aquí. */}
          <Route path="/chofer" element={<ChoferCodigoPage />} />
          <Route path="/chofer/servicios" element={<ChoferInicioPage />} />
          <Route path="/chofer/servicios/:id/evidencia" element={<ChoferEvidenciaPage />} />

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
            <Route path="/solicitudes/:id" element={<DetallePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ChoferProvider>
    </AuthProvider>
  );
}