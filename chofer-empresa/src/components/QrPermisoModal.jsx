import { QRCodeSVG } from "qrcode.react";
import "./QrPermisoModal.css";

// Contenido que lee la app de Supervisor: prefijo fijo + id del permiso,
// para distinguirlo de cualquier otro QR que se escanee por error.
export const PREFIJO_QR = "VIASEGURA-PERMISO:";

export default function QrPermisoModal({ permiso, onCerrar }) {
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
          <QRCodeSVG value={`${PREFIJO_QR}${permiso.id}`} size={240} level="M" marginSize={2} />
        </div>
        <p className="qr-id">Permiso {permiso.id.slice(0, 8).toUpperCase()}</p>

        <button type="button" className="btn-primary" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </div>
  );
}