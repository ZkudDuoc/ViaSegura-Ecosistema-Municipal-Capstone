import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { obtenerQrToken } from "../services/permisoService";
import { getApiErrorMessage } from "../services/api";
import "./QrPermisoModal.css";

// Semana 5: el QR ya NO es el id crudo del permiso (se podía copiar/adivinar
// sin más) — contiene un token firmado y con expiración (ver
// backend GET /permisos/:id/qr-token), que el Supervisor valida contra
// GET /permisos/qr/:token antes de mostrar cualquier dato.
export default function QrPermisoModal({ permiso, onCerrar }) {
  const [token, setToken] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelado = false;
    obtenerQrToken(permiso.id)
      .then(({ token }) => {
        if (!cancelado) setToken(token);
      })
      .catch((err) => {
        if (!cancelado) setError(getApiErrorMessage(err));
      });
    return () => {
      cancelado = true;
    };
  }, [permiso.id]);

  return (
    <div className="qr-fondo" onClick={onCerrar}>
      <div
        className="qr-modal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="qr-titulo">QR del permiso</h2>
        <p className="subtitulo">Muéstralo al supervisor municipal en terreno.</p>

        <div className="qr-codigo">
          {token && <QRCodeSVG value={token} size={240} level="M" marginSize={2} />}
          {!token && !error && <p className="subtitulo">Generando QR…</p>}
          {error && <p className="texto-error">{error}</p>}
        </div>
        <p className="qr-id">Permiso {permiso.id.slice(0, 8).toUpperCase()}</p>

        <button type="button" className="btn-primary" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
