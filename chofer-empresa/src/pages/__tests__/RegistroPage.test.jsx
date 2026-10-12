import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../../context/AuthContext";
import RegistroPage from "../RegistroPage";
import * as authService from "../../services/authService";

// No se llama al Backend: se simula la respuesta del registro.
vi.mock("../../services/authService", () => ({
  login: vi.fn(),
  me: vi.fn(),
  registrar: vi.fn(),
  registrarEmpresa: vi.fn(),
}));

function renderRegistro() {
  return render(
    <MemoryRouter initialEntries={["/registro"]}>
      <AuthProvider>
        <Routes>
          <Route path="/registro" element={<RegistroPage />} />
          <Route path="/" element={<p>Pantalla de inicio</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

async function escribir(usuario, etiqueta, texto) {
  const campo = screen.getByLabelText(etiqueta);
  await usuario.clear(campo);
  await usuario.type(campo, texto);
}

describe("Registro de empresa", () => {
  beforeEach(() => {
    vi.mocked(authService.registrarEmpresa).mockResolvedValue({
      empresa: { id: "e1", rut: "76123456-0", razon_social: "Transportes Prueba SpA", nombre_fantasia: null },
      usuario: { id: "u1", rol: "LOGISTICA", nombre: "Ana Prueba", empresa_id: "e1" },
      token: "token-de-prueba",
    });
    vi.mocked(authService.me).mockResolvedValue({
      id: "u1",
      rol: "LOGISTICA",
      nombre: "Ana Prueba",
      empresa: { id: "e1", rut: "76123456-0", razon_social: "Transportes Prueba SpA", nombre_fantasia: null },
    });
  });

  it("no deja avanzar con un RUT de empresa inválido", async () => {
    const usuario = userEvent.setup();
    renderRegistro();

    await escribir(usuario, "RUT de la empresa", "76123456-1");
    await usuario.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByText("Revisa el RUT: el dígito verificador no coincide.")).toBeInTheDocument();
    expect(screen.getByText(/Paso 1 de 3/)).toBeInTheDocument();
    expect(authService.registrarEmpresa).not.toHaveBeenCalled();
  });

  it("completa los 3 pasos, envía la empresa y entra con la sesión iniciada", async () => {
    const usuario = userEvent.setup();
    renderRegistro();

    // Paso 1: empresa
    await escribir(usuario, "RUT de la empresa", "761234560");
    await escribir(usuario, "Razón social", "Transportes Prueba SpA");
    await escribir(usuario, "Giro", "Transporte de carga");
    await escribir(usuario, "Dirección", "Calle Falsa 123");
    await escribir(usuario, "Email de contacto de la empresa", "contacto@prueba.cl");
    await escribir(usuario, "Teléfono", "+56 9 1234 5678");
    await usuario.click(screen.getByRole("button", { name: "Continuar" }));

    // Paso 2: representante legal
    expect(screen.getByText(/Paso 2 de 3/)).toBeInTheDocument();
    await escribir(usuario, "Nombre completo del representante legal", "Ana Prueba");
    await escribir(usuario, "RUT del representante legal", "11111111-1");
    await usuario.click(screen.getByRole("button", { name: "Continuar" }));

    // Paso 3: cuenta del administrador ("soy el representante" copia nombre y RUT)
    expect(screen.getByText(/Paso 3 de 3/)).toBeInTheDocument();
    await usuario.click(screen.getByLabelText("Yo soy el representante legal"));
    expect(screen.getByLabelText("Tu nombre completo")).toHaveValue("Ana Prueba");
    await escribir(usuario, "Tu email (para iniciar sesión)", "ana@prueba.cl");
    await escribir(usuario, "Contraseña", "clave-segura");
    await escribir(usuario, "Repite la contraseña", "clave-segura");
    await usuario.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByText("Pantalla de inicio")).toBeInTheDocument();
    expect(authService.registrarEmpresa).toHaveBeenCalledWith({
      empresa: {
        rut: "76123456-0",
        razon_social: "Transportes Prueba SpA",
        giro: "Transporte de carga",
        nombre_fantasia: undefined,
        direccion: "Calle Falsa 123",
        comuna: "Santiago",
        region: "Metropolitana de Santiago",
        email_contacto: "contacto@prueba.cl",
        telefono: "+56 9 1234 5678",
        representante_legal: { nombre: "Ana Prueba", rut: "11111111-1" },
      },
      usuario: { nombre: "Ana Prueba", rut: "11111111-1", email: "ana@prueba.cl", password: "clave-segura" },
    });
  });
});