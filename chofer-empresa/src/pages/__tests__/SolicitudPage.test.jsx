import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import SolicitudPage from "../SolicitudPage";
import { crearPermiso } from "../../services/permisoService";

// Sesión de una empresa (sin pasar por el login).
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ usuario: { rol: "LOGISTICA", rut: "11111111-1", empresa: { rut: "76123456-0" } } }),
}));

// Datos del Backend simulados.
vi.mock("../../services/catalogService", () => ({
  listarComunas: vi.fn().mockResolvedValue([{ id: "c1", nombre: "Santiago" }]),
}));
vi.mock("../../services/vehiculoService", () => ({
  listarVehiculos: vi.fn().mockResolvedValue([
    { id: "v1", patente: "DEMO12", largo_m: 12, ancho_m: 2.6, alto_m: 4, peso_ton: 18 },
  ]),
}));
vi.mock("../../services/trabajadorService", () => ({
  listarTrabajadores: vi.fn().mockResolvedValue({
    items: [
      { id: "t1", rut: "12345678-5", nombre: "Juan Pérez", cargo: "Chofer", contrato_vigente_hasta: "2099-12-31", epp_vigente_hasta: "2099-12-31", activo: true },
      { id: "t2", rut: "11111111-1", nombre: "Pedro Soto", cargo: "Peoneta", contrato_vigente_hasta: "2020-01-01", epp_vigente_hasta: "2099-12-31", activo: true },
    ],
    next_cursor: null,
  }),
}));
vi.mock("../../services/permisoService", () => ({
  crearPermiso: vi.fn(),
}));

// El mapa real (MapLibre) no corre en el entorno de pruebas: se reemplaza por
// un botón que entrega un área ya calculada, como lo haría el mapa.
const AREA = [[-70.65, -33.45], [-70.6499, -33.45], [-70.6499, -33.4499], [-70.65, -33.4499]];
vi.mock("../../components/UbicacionPicker", () => ({
  default: ({ onChange }) => (
    <button type="button" onClick={() => onChange({ area: AREA, largoTotalM: 18, anchoTotalM: 5 })}>
      Fijar ubicación de prueba
    </button>
  ),
}));

describe("Crear solicitud eligiendo trabajadores de la nómina", () => {
  beforeEach(() => {
    vi.mocked(crearPermiso).mockReset();
    vi.mocked(crearPermiso).mockResolvedValue({
      id: "p1",
      estado: "PENDIENTE_CONFIRMACION_MUNICIPAL",
      riesgo: { nivel: "Medio" },
      advertencias: [{ tipo: "CONTRATO_VENCIDO", rut: "11111111-1", nombre: "Pedro Soto" }],
    });
  });

  it("envía solo los ids de los trabajadores elegidos y avisa del contrato vencido sin bloquear", async () => {
    const usuario = userEvent.setup();
    render(
      <MemoryRouter>
        <SolicitudPage />
      </MemoryRouter>
    );

    // 1. Camión y 2. ubicación
    await usuario.selectOptions(await screen.findByLabelText("Camión"), "v1");
    await usuario.click(screen.getByRole("button", { name: "Fijar ubicación de prueba" }));

    // 3. Datos del servicio (el RUT viene prellenado con el de la empresa)
    await usuario.selectOptions(screen.getByLabelText("Comuna"), "c1");
    expect(screen.getByLabelText("RUT de la empresa responsable")).toHaveValue("76123456-0");
    fireEvent.change(screen.getByLabelText("Inicio"), { target: { value: "2099-03-10T09:00" } });
    fireEvent.change(screen.getByLabelText("Fin"), { target: { value: "2099-03-10T13:00" } });

    // Sin personal elegido no se puede enviar.
    const enviar = screen.getByRole("button", { name: "Enviar solicitud" });
    expect(enviar).toBeDisabled();

    // 4. Personal: se marcan los dos; Pedro tiene el contrato vencido.
    await usuario.click(await screen.findByRole("checkbox", { name: /Juan Pérez/ }));
    await usuario.click(screen.getByRole("checkbox", { name: /Pedro Soto/ }));
    expect(screen.getByText(/puedes enviar la solicitud igual/)).toBeInTheDocument();
    expect(screen.getByText(/Pedro Soto: contrato vencido/)).toBeInTheDocument();

    // La advertencia no bloquea: se puede enviar.
    expect(enviar).toBeEnabled();
    await usuario.click(enviar);

    expect(crearPermiso).toHaveBeenCalledTimes(1);
    const datos = vi.mocked(crearPermiso).mock.calls[0][0];
    expect(datos.trabajadores_ids).toEqual(["t1", "t2"]);
    expect(datos).not.toHaveProperty("personal");
    expect(datos).toMatchObject({ vehiculo_id: "v1", comuna_id: "c1", rut_ejecutor: "76123456-0", area: AREA });

    // Pantalla final con la advertencia que devolvió el Backend.
    expect(await screen.findByText("Solicitud enviada")).toBeInTheDocument();
    expect(screen.getByText(/Pedro Soto: contrato no vigente/)).toBeInTheDocument();
  });
});