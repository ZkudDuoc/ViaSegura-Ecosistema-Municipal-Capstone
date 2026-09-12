import { Navigate, Route, Routes } from "react-router-dom";
import { RoleProvider } from "./context/RoleContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import DashboardLayout from "./layouts/DashboardLayout";
import LoginPage from "./pages/LoginPage";
import OperadorPage from "./pages/OperadorPage";
import SupervisorPage from "./pages/SupervisorPage";

function AuthGate({ children }) {
  const { usuario } = useAuth();
  return usuario ? children : <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <RoleProvider>
        <AuthGate>
          <Routes>
            <Route element={<DashboardLayout />}>
              <Route index element={<Navigate to="/operador" replace />} />
              <Route path="/operador" element={<OperadorPage />} />
              <Route path="/supervisor" element={<SupervisorPage />} />
            </Route>
          </Routes>
        </AuthGate>
      </RoleProvider>
    </AuthProvider>
  );
}
