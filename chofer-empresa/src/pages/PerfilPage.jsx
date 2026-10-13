import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { me } from "../services/authService";
import { formatearRut } from "../utils/rut";
import { iniciales, ROL_TEXTO } from "../utils/empresa";
import Icono from "../components/Icono";
import "./paginas.css";
import "./perfil.css";

function Dato({ etiqueta, valor }) {
  return (
    <div className="perfil-dato">
      <dt>{etiqueta}</dt>
      <dd>{valor || "—"}</dd>
    </div>
  );
}

// "Mi perfil": la cuenta en uso y su empresa. Solo lectura por ahora (editar
// datos y cambiar contraseña necesitan endpoints del Backend).
export default function PerfilPage() {
  const { usuario: sesion, logout } = useAuth();
  // Se piden los datos al abrir la página, por si cambiaron desde que se
  // inició la sesión; mientras tanto se muestran los de la sesión.
  const [usuario, setUsuario] = useState(sesion);

  useEffect(() => {
    me()
      .then(setUsuario)
      .catch(() => {});
  }, []);

  const empresa = usuario?.empresa;
  const esAdministrador = usuario?.rol === "LOGISTICA";

  return (
    <div className="perfil">
      <h1>Mi perfil</h1>
      <p className="subtitulo">Los datos de tu cuenta y de tu empresa.</p>

      <section className="card perfil-cabecera">
        <div className="perfil-avatar" aria-hidden="true">
          {iniciales(usuario?.nombre)}
        </div>
        <div>
          <div className="perfil-nombre">{usuario?.nombre}</div>
          <div className="perfil-rol">
            {ROL_TEXTO[usuario?.rol] ?? usuario?.rol}
            {empresa ? ` · ${empresa.nombre_fantasia || empresa.razon_social}` : ""}
          </div>
        </div>
      </section>

      <section className="card paso" aria-labelledby="titulo-cuenta">
        <h2 id="titulo-cuenta" className="paso-titulo">
          Tu cuenta
        </h2>
        <dl className="perfil-datos">
          <Dato etiqueta="Nombre" valor={usuario?.nombre} />
          <Dato etiqueta="RUT" valor={usuario?.rut ? formatearRut(usuario.rut) : null} />
          <Dato etiqueta="Email (para iniciar sesión)" valor={usuario?.email} />
          <Dato etiqueta="Rol" valor={ROL_TEXTO[usuario?.rol] ?? usuario?.rol} />
        </dl>
        <p className="perfil-nota">
          {esAdministrador
            ? "Como administrador puedes crear solicitudes y manejar los camiones y la nómina de trabajadores."
            : "Como chofer puedes ver las solicitudes de tu empresa. Los cambios los hace el administrador."}
        </p>
      </section>

      {empresa && (
        <section className="card paso" aria-labelledby="titulo-empresa">
          <h2 id="titulo-empresa" className="paso-titulo">
            Tu empresa
          </h2>
          <dl className="perfil-datos">
            <Dato etiqueta="Razón social" valor={empresa.razon_social} />
            <Dato etiqueta="Nombre de fantasía" valor={empresa.nombre_fantasia} />
            <Dato etiqueta="RUT de la empresa" valor={empresa.rut ? formatearRut(empresa.rut) : null} />
          </dl>
        </section>
      )}

      <section className="card paso" aria-labelledby="titulo-seguridad">
        <h2 id="titulo-seguridad" className="paso-titulo">
          Seguridad
        </h2>
        <p className="perfil-nota">
          Pronto podrás cambiar tu contraseña y actualizar tus datos desde aquí.
        </p>
        <button type="button" className="perfil-salir" onClick={logout}>
          <Icono nombre="salir" tamano={18} />
          Cerrar sesión
        </button>
      </section>
    </div>
  );
}