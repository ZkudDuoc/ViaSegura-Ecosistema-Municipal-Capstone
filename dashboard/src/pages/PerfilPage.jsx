import { useAuth } from "../context/AuthContext";
import useNombreComuna from "../hooks/useNombreComuna";
import { formatearRut, iniciales } from "../utils/rut";
import Icono from "../components/Icono";
import "./PerfilPage.css";

const ROL_TEXTO = {
  OPERADOR_MUNICIPAL: "Operador central",
  INSPECTOR_MUNICIPAL: "Supervisor en terreno",
};

function Dato({ etiqueta, valor }) {
  return (
    <div className="perfil-dato">
      <dt>{etiqueta}</dt>
      <dd>{valor || "—"}</dd>
    </div>
  );
}

// "Mi perfil": los datos de la cuenta con la que se entró. Solo lectura por
// ahora (editar datos y cambiar contraseña necesitan endpoints del Backend).
export default function PerfilPage() {
  const { usuario, logout } = useAuth();
  const comuna = useNombreComuna(usuario?.comuna_id);

  return (
    <div className="perfil">
      <h1>Mi perfil</h1>
      <p className="perfil-subtitulo">Los datos de la cuenta con la que entraste al panel.</p>

      <section className="perfil-tarjeta perfil-cabecera">
        <div className="perfil-avatar" aria-hidden="true">
          {iniciales(usuario?.nombre)}
        </div>
        <div>
          <div className="perfil-nombre">{usuario?.nombre}</div>
          <div className="perfil-rol">
            {ROL_TEXTO[usuario?.rol] ?? usuario?.rol}
            {comuna ? ` · Municipalidad de ${comuna}` : ""}
          </div>
        </div>
      </section>

      <section className="perfil-tarjeta" aria-labelledby="titulo-datos">
        <h2 id="titulo-datos">Datos de la cuenta</h2>
        <dl className="perfil-datos">
          <Dato etiqueta="Nombre" valor={usuario?.nombre} />
          <Dato etiqueta="RUT" valor={formatearRut(usuario?.rut)} />
          <Dato etiqueta="Email (para iniciar sesión)" valor={usuario?.email} />
          <Dato etiqueta="Rol" valor={ROL_TEXTO[usuario?.rol] ?? usuario?.rol} />
          <Dato etiqueta="Comuna que administras" valor={comuna} />
        </dl>
        <p className="perfil-nota">
          Solo ves y decides sobre las solicitudes de esta comuna. Si algún dato está mal, pídele al administrador del
          sistema que lo corrija.
        </p>
      </section>

      <section className="perfil-tarjeta" aria-labelledby="titulo-seguridad">
        <h2 id="titulo-seguridad">Seguridad</h2>
        <p className="perfil-nota">
          Por ahora la contraseña la cambia el administrador del sistema. Pronto podrás cambiarla desde aquí.
        </p>
        <button type="button" className="perfil-salir" onClick={logout}>
          <Icono nombre="salir" />
          Cerrar sesión
        </button>
      </section>
    </div>
  );
}