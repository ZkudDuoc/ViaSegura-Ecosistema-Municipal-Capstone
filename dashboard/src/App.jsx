import { Navigate, Route, Routes } from "react-router-dom";
import { RoleProvider } from "./context/RoleContext";
import DashboardLayout from "./layouts/DashboardLayout";
import OperadorPage from "./pages/OperadorPage";
import SupervisorPage from "./pages/SupervisorPage";

export default function App() {
  return (
    <RoleProvider>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route index element={<Navigate to="/operador" replace />} />
          <Route path="/operador" element={<OperadorPage />} />
          <Route path="/supervisor" element={<SupervisorPage />} />
        </Route>
      </Routes>
    </RoleProvider>
  );
}
