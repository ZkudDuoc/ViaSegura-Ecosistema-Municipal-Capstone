function base64ABytes(base64) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

// TOTP (RFC 6238) con HMAC-SHA256: no usa la red, solo la clave y la hora.
export async function generarCodigo({ secreto, periodo, digitos }, ahoraMs) {
  const contador = new DataView(new ArrayBuffer(8));
  contador.setBigUint64(0, BigInt(Math.floor(ahoraMs / 1000 / periodo)));

  const clave = await crypto.subtle.importKey("raw", base64ABytes(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = new Uint8Array(await crypto.subtle.sign("HMAC", clave, contador.buffer));

  const inicio = firma[firma.length - 1] & 0x0f;
  const numero = new DataView(firma.buffer).getUint32(inicio) & 0x7fffffff;
  return String(numero % 10 ** digitos).padStart(digitos, "0");
}