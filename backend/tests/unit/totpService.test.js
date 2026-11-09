const { generarCodigo, verificarCodigo, generarSecreto, parsearQr, PERIODO_SEGUNDOS, DIGITOS, ALGORITMO } = require('../../src/services/totpService');

// Vectores de prueba de RFC 6238 (apéndice B) para HMAC-SHA256, 8 dígitos.
const CLAVE_RFC = Buffer.from('12345678901234567890123456789012');

describe('RFC 6238 (HMAC-SHA256, 8 dígitos)', () => {
  test.each([
    [59, '46119246'],
    [1111111109, '68084774'],
    [1111111111, '67062674'],
    [1234567890, '91819424'],
    [2000000000, '90698825'],
    [20000000000, '77737706'],
  ])('T = %i s -> %s', (segundos, esperado) => {
    expect(generarCodigo(CLAVE_RFC, segundos * 1000)).toBe(esperado);
  });

  test('constantes que el teléfono necesita para generar el mismo código', () => {
    expect(PERIODO_SEGUNDOS).toBe(30);
    expect(DIGITOS).toBe(8);
    expect(ALGORITMO).toBe('SHA-256');
  });

  test('el código es el mismo durante todo el período de 30 s y cambia en el siguiente', () => {
    const inicio = 1700000010 * 1000; // múltiplo de 30
    expect(generarCodigo(CLAVE_RFC, inicio)).toBe(generarCodigo(CLAVE_RFC, inicio + 29999));
    expect(generarCodigo(CLAVE_RFC, inicio)).not.toBe(generarCodigo(CLAVE_RFC, inicio + 30000));
  });

  test('conserva los ceros a la izquierda (siempre 8 caracteres)', () => {
    for (let t = 0; t < 400; t++) {
      expect(generarCodigo(CLAVE_RFC, t * 30000)).toMatch(/^\d{8}$/);
    }
  });
});

describe('verificarCodigo', () => {
  const ahora = 1700000000 * 1000;
  const clave = Buffer.from('una-clave-secreta-de-prueba-0123456789abcdef');

  test('acepta el paso actual, el anterior y el siguiente (desfase de reloj)', () => {
    expect(verificarCodigo(clave, generarCodigo(clave, ahora), ahora)).toBe(true);
    expect(verificarCodigo(clave, generarCodigo(clave, ahora, -1), ahora)).toBe(true);
    expect(verificarCodigo(clave, generarCodigo(clave, ahora, 1), ahora)).toBe(true);
  });

  test('rechaza un código vencido (2 pasos atrás) o futuro (2 pasos adelante)', () => {
    expect(verificarCodigo(clave, generarCodigo(clave, ahora, -2), ahora)).toBe(false);
    expect(verificarCodigo(clave, generarCodigo(clave, ahora, 2), ahora)).toBe(false);
    expect(verificarCodigo(clave, generarCodigo(clave, ahora - 5 * 60 * 1000), ahora)).toBe(false);
  });

  test('rechaza un código de otro secreto', () => {
    const otra = Buffer.from('otra-clave-distinta-de-prueba-0123456789abcdef');
    expect(verificarCodigo(clave, generarCodigo(otra, ahora), ahora)).toBe(false);
  });

  test.each([undefined, null, 12345678, '1234567', '123456789', 'abcdefgh', '1234 678', ''])('rechaza el formato inválido %p sin lanzar', (codigo) => {
    expect(verificarCodigo(clave, codigo, ahora)).toBe(false);
  });
});

describe('secreto y formato del QR', () => {
  test('el secreto son 32 bytes aleatorios en base64 y no se repite', () => {
    const a = generarSecreto();
    const b = generarSecreto();
    expect(Buffer.from(a, 'base64')).toHaveLength(32);
    expect(a).not.toBe(b);
  });

  test('parsearQr separa VS1.<permisoId>.<codigo>', () => {
    expect(parsearQr('VS1.3f2b8c1e-9d4a-4c7e-8b1a-2d5e6f7a8b9c.12345678')).toEqual({
      permisoId: '3f2b8c1e-9d4a-4c7e-8b1a-2d5e6f7a8b9c',
      codigo: '12345678',
    });
  });

  test.each(['VS1', 'VS1.solo-uno', 'VS1.a.b.c', 'VS2.a.b', 'eyJhbGciOiJIUzI1NiJ9.eyJ0aXBvIjoiUVIifQ.firma', '', null, undefined])('parsearQr(%p) no es un QR dinámico', (token) => {
    expect(parsearQr(token)).toBeNull();
  });
});
