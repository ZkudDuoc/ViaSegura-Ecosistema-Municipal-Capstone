const LADO_MAX_PX = 480;
const CALIDAD_JPEG = 0.5;

// El Backend todavía no tiene subida de archivos y acepta JSON de hasta
// 100 kB: se reduce la foto y se envía como data URL (~20-40 kB).
export function comprimirFoto(archivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, LADO_MAX_PX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", CALIDAD_JPEG));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la foto"));
    };
    img.src = url;
  });
}