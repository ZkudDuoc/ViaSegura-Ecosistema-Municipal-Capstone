import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { generarCodigo } from "../../utils/totp";

// QR que el celular genera solo y sin internet. Cambia en cada período, así
// un pantallazo enviado a otra persona deja de servir.
export default function QrDinamico({ permisoId, config }) {
  const [codigo, setCodigo] = useState(null);
  const [restante, setRestante] = useState(config.periodo);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let activo = true;
    let pasoActual = null;

    const actualizar = async () => {
      const ahora = Date.now() + config.desfaseMs;
      const segundos = Math.floor(ahora / 1000);
      setRestante(config.periodo - (segundos % config.periodo));

      const paso = Math.floor(segundos / config.periodo);
      if (paso === pasoActual) return;
      pasoActual = paso;

      try {
        const nuevo = await generarCodigo(config, ahora);
        if (activo) setCodigo(nuevo);
      } catch {
        if (activo) setFallo(true);
      }
    };

    actualizar();
    const intervalo = setInterval(actualizar, 1000);
    return () => {
      activo = false;
      clearInterval(intervalo);
    };
  }, [config]);

  if (fallo) return <p className="texto-error">No se pudo generar el QR en este navegador.</p>;
  if (!codigo) return <p className="subtitulo">Generando QR…</p>;

  return (
    <>
      <QRCodeSVG value={`VS1.${permisoId}.${codigo}`} size={280} level="M" marginSize={2} />
      <div className="qr-barra" aria-hidden="true">
        <div className="qr-barra-avance" style={{ width: `${(restante / config.periodo) * 100}%` }} />
      </div>
      <p className="permiso-detalle">Cambia en {restante} s</p>
    </>
  );
}