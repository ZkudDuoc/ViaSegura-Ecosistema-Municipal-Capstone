import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getApiErrorMessage } from "../services/api";
import { formatearRut, normalizarRut, validarRut } from "../utils/rut";
import "./LoginPage.css";
import "./registro.css";

const REGIONES = [
  "Arica y Parinacota",
  "Tarapacá",
  "Antofagasta",
  "Atacama",
  "Coquimbo",
  "Valparaíso",
  "Metropolitana de Santiago",
  "Libertador General Bernardo O'Higgins",
  "Maule",
  "Ñuble",
  "Biobío",
  "La Araucanía",
  "Los Ríos",
  "Los Lagos",
  "Aysén del General Carlos Ibáñez del Campo",
  "Magallanes y de la Antártica Chilena",
];

const PASSWORD_MINIMA = 8;

const FORM_INICIAL = {
  rut_empresa: "",
  razon_social: "",
  nombre_fantasia: "",
  giro: "",
  direccion: "",
  comuna: "Santiago",
  region: "Metropolitana de Santiago",
  email_contacto: "",
  telefono: "",
  rep_nombre: "",
  rep_rut: "",
  nombre: "",
  rut: "",
  email: "",
  password: "",
  confirmacion: "",
};

const PASOS = [
  {
    titulo: "Datos de la empresa",
    campos: ["rut_empresa", "razon_social", "giro", "direccion", "comuna", "region", "email_contacto", "telefono"],
  },
  { titulo: "Representante legal", campos: ["rep_nombre", "rep_rut"] },
  { titulo: "Tu cuenta de administrador", campos: ["nombre", "rut", "email", "password", "confirmacion"] },
];

const esEmail = (texto) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto.trim());
const digitos = (texto) => texto.replace(/\D/g, "");

// Mensaje de error de cada campo (o undefined si está bien).
function validar(form) {
  const e = {};
  const obligatorio = (campo, mensaje) => {
    if (!form[campo].trim()) e[campo] = mensaje;
  };
  const rut = (campo, quien) => {
    if (!form[campo].trim()) e[campo] = `Escribe el RUT ${quien}.`;
    else if (!validarRut(form[campo])) e[campo] = "Revisa el RUT: el dígito verificador no coincide.";
  };

  rut("rut_empresa", "de la empresa");
  obligatorio("razon_social", "Escribe la razón social, tal como aparece en el SII.");
  obligatorio("giro", "Escribe el giro o actividad de la empresa.");
  obligatorio("direccion", "Escribe la dirección de la empresa.");
  obligatorio("comuna", "Escribe la comuna.");
  obligatorio("region", "Elige la región.");
  if (!esEmail(form.email_contacto)) e.email_contacto = "Escribe un email válido, por ejemplo contacto@empresa.cl.";
  const telefono = digitos(form.telefono).length;
  if (telefono < 8 || telefono > 12) e.telefono = "Escribe un teléfono válido, por ejemplo +56 9 1234 5678.";

  obligatorio("rep_nombre", "Escribe el nombre del representante legal.");
  rut("rep_rut", "del representante legal");

  obligatorio("nombre", "Escribe tu nombre.");
  rut("rut", "tuyo");
  if (!esEmail(form.email)) e.email = "Escribe un email válido. Lo usarás para iniciar sesión.";
  if (form.password.length < PASSWORD_MINIMA) e.password = `La contraseña debe tener al menos ${PASSWORD_MINIMA} caracteres.`;
  if (form.confirmacion !== form.password) e.confirmacion = "Las contraseñas no coinciden.";

  return e;
}

// Ubica un error del servidor en el paso y el campo correspondiente.
function ubicarErrorServidor(mensaje) {
  const m = mensaje.toLowerCase();
  if (m.includes("empresa registrada") || m.includes("rut de la empresa")) return { paso: 0, campo: "rut_empresa" };
  if (m.includes("email de contacto")) return { paso: 0, campo: "email_contacto" };
  if (m.includes("representante")) return { paso: 1, campo: m.includes("rut") ? "rep_rut" : "rep_nombre" };
  if (m.includes("email")) return { paso: 2, campo: "email" };
  if (m.includes("contraseña")) return { paso: 2, campo: "password" };
  if (m.includes("rut")) return { paso: 2, campo: "rut" };
  return null;
}

function Campo({ id, label, error, ayuda, children }) {
  return (
    <div className="campo">
      <label htmlFor={id}>{label}</label>
      {children}
      {ayuda && !error && <span className="registro-ayuda">{ayuda}</span>}
      {error && (
        <span className="texto-error campo-error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}

export default function RegistroPage() {
  const { usuario, verificando, registrarEmpresa } = useAuth();
  const navigate = useNavigate();

  const [paso, setPaso] = useState(0);
  const [form, setForm] = useState(FORM_INICIAL);
  const [tocados, setTocados] = useState({});
  const [soyRepresentante, setSoyRepresentante] = useState(false);
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState(null);
  const [erroresServidor, setErroresServidor] = useState({});
  const tituloRef = useRef(null);

  // Al cambiar de paso, el foco va al título: quien usa lector de pantalla
  // escucha en qué paso está, y en el celular la vista vuelve arriba.
  useEffect(() => {
    tituloRef.current?.focus();
  }, [paso]);

  if (verificando) return null;
  if (usuario) return <Navigate to="/" replace />;

  const errores = { ...validar(form), ...erroresServidor };
  const errorDe = (campo) => (tocados[campo] ? errores[campo] : undefined);
  const pasoValido = (i) => PASOS[i].campos.every((c) => !errores[c]);

  const cambiar = (campo) => (e) => {
    const valor = e.target.value;
    setForm((f) => ({ ...f, [campo]: valor }));
    // Se borra la clave (no se deja en undefined): si quedara, taparía el error
    // de validación del campo al combinar los dos objetos de errores.
    setErroresServidor(({ [campo]: _borrado, ...resto }) => resto);
  };
  const tocar = (campo) => () => setTocados((t) => ({ ...t, [campo]: true }));
  const formatearAlSalir = (campo) => () => {
    tocar(campo)();
    if (validarRut(form[campo])) setForm((f) => ({ ...f, [campo]: formatearRut(f[campo]) }));
  };

  const propsDe = (campo) => ({
    id: campo,
    value: form[campo],
    onChange: cambiar(campo),
    onBlur: tocar(campo),
    "aria-invalid": Boolean(errorDe(campo)),
    "aria-describedby": errorDe(campo) ? `${campo}-error` : undefined,
  });

  const marcarPaso = (i) =>
    setTocados((t) => ({ ...t, ...Object.fromEntries(PASOS[i].campos.map((c) => [c, true])) }));

  // Lleva el cursor al primer campo con error del paso, para corregirlo altiro.
  const enfocarPrimerError = (i) => {
    const campo = PASOS[i].campos.find((c) => errores[c]);
    if (campo) setTimeout(() => document.getElementById(campo)?.focus(), 0);
  };

  const siguiente = () => {
    marcarPaso(paso);
    if (!pasoValido(paso)) {
      enfocarPrimerError(paso);
      return;
    }
    setErrorGeneral(null);
    // Si escribió el RUT y pasó con Enter (sin salir del campo), se formatea igual.
    setForm((f) => ({ ...f, rut_empresa: formatearRut(f.rut_empresa), rep_rut: formatearRut(f.rep_rut) }));
    setPaso((p) => p + 1);
  };

  const alternarSoyRepresentante = (marcado) => {
    setSoyRepresentante(marcado);
    if (marcado) setForm((f) => ({ ...f, nombre: f.rep_nombre, rut: formatearRut(f.rep_rut) }));
  };

  const enviar = async (e) => {
    e.preventDefault();
    if (paso < PASOS.length - 1) {
      siguiente();
      return;
    }
    marcarPaso(paso);
    const primeroConError = PASOS.findIndex((_, i) => !pasoValido(i));
    if (primeroConError !== -1) {
      marcarPaso(primeroConError);
      setPaso(primeroConError);
      enfocarPrimerError(primeroConError);
      return;
    }

    setErrorGeneral(null);
    setEnviando(true);
    try {
      await registrarEmpresa({
        empresa: {
          rut: normalizarRut(form.rut_empresa),
          razon_social: form.razon_social.trim(),
          giro: form.giro.trim(),
          nombre_fantasia: form.nombre_fantasia.trim() || undefined,
          direccion: form.direccion.trim(),
          comuna: form.comuna.trim(),
          region: form.region,
          email_contacto: form.email_contacto.trim(),
          telefono: form.telefono.trim(),
          representante_legal: { nombre: form.rep_nombre.trim(), rut: normalizarRut(form.rep_rut) },
        },
        usuario: {
          nombre: form.nombre.trim(),
          rut: normalizarRut(form.rut),
          email: form.email.trim(),
          password: form.password,
        },
      });
      navigate("/", { replace: true });
    } catch (err) {
      const mensaje =
        err?.response?.status === 429
          ? "Hiciste muchos intentos seguidos. Espera unos minutos y vuelve a intentarlo."
          : getApiErrorMessage(err);
      const ubicado = err?.response ? ubicarErrorServidor(mensaje) : null;
      if (ubicado) {
        setErroresServidor({ [ubicado.campo]: mensaje });
        setTocados((t) => ({ ...t, [ubicado.campo]: true }));
        setPaso(ubicado.paso);
        setTimeout(() => document.getElementById(ubicado.campo)?.focus(), 0);
      } else {
        setErrorGeneral(mensaje);
      }
    } finally {
      setEnviando(false);
    }
  };

  const ultimoPaso = paso === PASOS.length - 1;

  return (
    <div className="login-screen">
      <form className="login-card registro-card card" onSubmit={enviar} noValidate>
        <h1>Registrar empresa</h1>
        <p className="subtitulo">Crea la cuenta de tu empresa en 3 pasos. Tú quedarás como administrador.</p>

        <ol className="registro-pasos" aria-label="Pasos del registro">
          {PASOS.map((p, i) => (
            <li
              key={p.titulo}
              className={"registro-paso" + (i === paso ? " actual" : "") + (i < paso ? " listo" : "")}
              aria-current={i === paso ? "step" : undefined}
            >
              <span className="registro-paso-numero">{i < paso ? "✓" : i + 1}</span>
              <span className="registro-paso-titulo">{p.titulo}</span>
            </li>
          ))}
        </ol>

        <h2 className="paso-titulo registro-titulo" tabIndex={-1} ref={tituloRef}>
          Paso {paso + 1} de {PASOS.length}: {PASOS[paso].titulo}
        </h2>

        {paso === 0 && (
          <>
            <Campo id="rut_empresa" label="RUT de la empresa" error={errorDe("rut_empresa")}>
              <input {...propsDe("rut_empresa")} onBlur={formatearAlSalir("rut_empresa")} placeholder="76.123.456-7" autoComplete="off" />
            </Campo>
            <Campo id="razon_social" label="Razón social" error={errorDe("razon_social")} ayuda="Como aparece en el SII.">
              <input {...propsDe("razon_social")} placeholder="Ej: Transportes del Centro SpA" autoComplete="organization" />
            </Campo>
            <Campo id="nombre_fantasia" label="Nombre de fantasía (opcional)" ayuda="El nombre con que los conocen, si es distinto.">
              <input {...propsDe("nombre_fantasia")} placeholder="Ej: TransCentro" />
            </Campo>
            <Campo id="giro" label="Giro" error={errorDe("giro")}>
              <input {...propsDe("giro")} placeholder="Ej: Transporte de carga por carretera" />
            </Campo>
            <Campo id="direccion" label="Dirección" error={errorDe("direccion")}>
              <input {...propsDe("direccion")} placeholder="Ej: Av. Libertador Bernardo O'Higgins 1234" autoComplete="street-address" />
            </Campo>
            <div className="fila-campos">
              <Campo id="comuna" label="Comuna" error={errorDe("comuna")}>
                <input {...propsDe("comuna")} autoComplete="address-level2" />
              </Campo>
              <Campo id="region" label="Región" error={errorDe("region")}>
                <select {...propsDe("region")}>
                  {REGIONES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            <Campo id="email_contacto" label="Email de contacto de la empresa" error={errorDe("email_contacto")}>
              <input {...propsDe("email_contacto")} type="email" placeholder="contacto@empresa.cl" autoComplete="email" />
            </Campo>
            <Campo id="telefono" label="Teléfono" error={errorDe("telefono")}>
              <input {...propsDe("telefono")} type="tel" placeholder="+56 9 1234 5678" autoComplete="tel" />
            </Campo>
          </>
        )}

        {paso === 1 && (
          <>
            <p className="registro-ayuda registro-intro">
              Es la persona que firma por la empresa. Sus datos están en la escritura o en el certificado del SII.
            </p>
            <Campo id="rep_nombre" label="Nombre completo del representante legal" error={errorDe("rep_nombre")}>
              <input {...propsDe("rep_nombre")} autoComplete="off" />
            </Campo>
            <Campo id="rep_rut" label="RUT del representante legal" error={errorDe("rep_rut")}>
              <input {...propsDe("rep_rut")} onBlur={formatearAlSalir("rep_rut")} placeholder="12.345.678-9" autoComplete="off" />
            </Campo>
          </>
        )}

        {paso === 2 && (
          <>
            <p className="registro-ayuda registro-intro">
              Con este email y contraseña entrarás a VíaSegura para pedir permisos y administrar camiones y trabajadores.
            </p>
            <label className="check registro-soy-rep">
              <input type="checkbox" checked={soyRepresentante} onChange={(e) => alternarSoyRepresentante(e.target.checked)} />
              Yo soy el representante legal
            </label>
            <Campo id="nombre" label="Tu nombre completo" error={errorDe("nombre")}>
              <input {...propsDe("nombre")} autoComplete="name" />
            </Campo>
            <Campo id="rut" label="Tu RUT" error={errorDe("rut")}>
              <input {...propsDe("rut")} onBlur={formatearAlSalir("rut")} placeholder="12.345.678-9" autoComplete="off" />
            </Campo>
            <Campo id="email" label="Tu email (para iniciar sesión)" error={errorDe("email")}>
              <input {...propsDe("email")} type="email" autoComplete="username" />
            </Campo>
            <Campo
              id="password"
              label="Contraseña"
              error={errorDe("password")}
              ayuda={`Mínimo ${PASSWORD_MINIMA} caracteres. Llevas ${form.password.length}.`}
            >
              <div className="password-wrapper">
                <input {...propsDe("password")} type={mostrarPassword ? "text" : "password"} autoComplete="new-password" />
                <button
                  type="button"
                  className="password-toggle registro-ver"
                  onClick={() => setMostrarPassword((v) => !v)}
                  aria-pressed={mostrarPassword}
                >
                  {mostrarPassword ? "Ocultar" : "Ver"}
                </button>
              </div>
            </Campo>
            <Campo id="confirmacion" label="Repite la contraseña" error={errorDe("confirmacion")}>
              <input {...propsDe("confirmacion")} type={mostrarPassword ? "text" : "password"} autoComplete="new-password" />
            </Campo>

            <div className="registro-resumen">
              <strong>Vas a registrar:</strong> {form.nombre_fantasia.trim() || form.razon_social.trim()} (RUT{" "}
              {formatearRut(form.rut_empresa)}), con {form.rep_nombre.trim()} como representante legal.
            </div>
          </>
        )}

        {errorGeneral && (
          <p className="texto-error" role="alert">
            {errorGeneral}
          </p>
        )}

        <div className="registro-botones">
          {paso > 0 && (
            <button type="button" className="btn-secondary" onClick={() => setPaso((p) => p - 1)} disabled={enviando}>
              Volver
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={enviando}>
            {ultimoPaso ? (enviando ? "Creando cuenta…" : "Crear cuenta") : "Continuar"}
          </button>
        </div>

        <p className="login-alternativa">
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="enlace">
            Inicia sesión
          </Link>
        </p>
      </form>
    </div>
  );
}