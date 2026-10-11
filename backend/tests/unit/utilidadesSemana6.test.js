const { validarRut, normalizarRut } = require('../../src/utils/rut');
const { leerLimite, codificarCursor, decodificarCursor, armarPagina } = require('../../src/utils/paginacion');
const { fechaIso, diaIso, rangoFechasValidado, esUuid, esEmail } = require('../../src/utils/validar');
const { fechaYHoraSantiago } = require('../../src/utils/fechas');
const { origenesPermitidos, opcionesCors, opcionesSocketCors } = require('../../src/config/cors');
const { validarEntorno } = require('../../src/config/env');

describe('rut', () => {
  test.each(['11111111-1', '12345678-5', '76086428-5', '12.345.678-5', '76.543.210-3', '1-9'])('%s es válido', (rut) => {
    expect(validarRut(rut)).toBe(true);
  });

  test.each(['11111111-2', '12345678-9', '', 'abc', '123', null, undefined, 12345678])('%p es inválido', (rut) => {
    expect(validarRut(rut)).toBe(false);
  });

  test('normaliza puntos, espacios y mayúscula del dígito verificador', () => {
    expect(normalizarRut(' 12.345.678-5 ')).toBe('12345678-5');
    expect(normalizarRut('123456785')).toBe('12345678-5');
    expect(normalizarRut('7654321-k')).toBe('7654321-K');
    expect(normalizarRut('xx')).toBeNull();
  });
});

describe('paginacion', () => {
  test('leerLimite aplica defecto y tope', () => {
    expect(leerLimite(undefined)).toBe(25);
    expect(leerLimite('abc')).toBe(25);
    expect(leerLimite('0')).toBe(25);
    expect(leerLimite('10')).toBe(10);
    expect(leerLimite('5000')).toBe(100);
  });

  test('el cursor se codifica y decodifica sin perder datos', () => {
    const cursor = codificarCursor({ creado: '2026-10-10 12:00:00.123456+00', id: 'abc' });
    expect(decodificarCursor(cursor)).toEqual({ creado: '2026-10-10 12:00:00.123456+00', id: 'abc' });
  });

  test('un cursor corrupto se decodifica como null', () => {
    expect(decodificarCursor('esto-no-es-un-cursor')).toBeNull();
    expect(decodificarCursor(undefined)).toBeNull();
  });

  test('armarPagina pide una fila de más para saber si hay otra página', () => {
    const filas = [
      { id: 'a', cursor_creado: 't1', x: 1 },
      { id: 'b', cursor_creado: 't2', x: 2 },
      { id: 'c', cursor_creado: 't3', x: 3 },
    ];
    const { items, next_cursor } = armarPagina(filas, 2);
    expect(items).toEqual([{ id: 'a', x: 1 }, { id: 'b', x: 2 }]);
    expect(decodificarCursor(next_cursor)).toEqual({ creado: 't2', id: 'b' });

    const ultima = armarPagina(filas.slice(0, 2), 2);
    expect(ultima.next_cursor).toBeNull();
    expect(ultima.items).toHaveLength(2);
  });
});

describe('validar', () => {
  test('fechaIso acepta ISO y rechaza basura', () => {
    expect(fechaIso('2026-10-10T12:00:00Z')).toBeInstanceOf(Date);
    expect(fechaIso('2026-10-10')).toBeInstanceOf(Date);
    expect(fechaIso('abc')).toBeNull();
    expect(fechaIso('2026-13-45')).toBeNull();
    expect(fechaIso(123)).toBeNull();
  });

  test('diaIso solo acepta AAAA-MM-DD', () => {
    expect(diaIso('2026-10-10')).toBe('2026-10-10');
    expect(diaIso('10/10/2026')).toBeNull();
  });

  test('rangoFechasValidado aplica defectos, orden y tope de días', () => {
    const { desde, hasta } = rangoFechasValidado({ desde: '2026-01-01', hasta: '2026-02-01' });
    expect(desde < hasta).toBe(true);

    expect(() => rangoFechasValidado({ desde: 'abc' })).toThrow(/desde/);
    expect(() => rangoFechasValidado({ hasta: 'abc' })).toThrow(/hasta/);
    expect(() => rangoFechasValidado({ desde: '2026-03-01', hasta: '2026-02-01' })).toThrow(/posterior/);
    expect(() => rangoFechasValidado({ desde: '2024-01-01', hasta: '2026-02-01' })).toThrow(/máximo/);
    try {
      rangoFechasValidado({ desde: 'abc' });
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.publico).toBe(true);
    }
  });

  test('esUuid y esEmail', () => {
    expect(esUuid('3f2b8c1e-9d4a-4c7e-8b1a-2d5e6f7a8b9c')).toBe(true);
    expect(esUuid('123')).toBe(false);
    expect(esEmail('a@b.cl')).toBe(true);
    expect(esEmail('a@b')).toBe(false);
  });
});

describe('fechaYHoraSantiago', () => {
  test('en invierno (UTC-4) una faena a las 22:30 locales cae al día anterior en UTC', () => {
    expect(fechaYHoraSantiago('2026-07-01T02:30:00Z')).toEqual({ fecha: '2026-06-30', hora: 22 });
  });

  test('en verano (UTC-3) medianoche local es hora 0 (no 24)', () => {
    expect(fechaYHoraSantiago('2026-01-15T03:00:00Z')).toEqual({ fecha: '2026-01-15', hora: 0 });
  });

  test('acepta objetos Date', () => {
    expect(fechaYHoraSantiago(new Date('2026-01-15T15:00:00Z'))).toEqual({ fecha: '2026-01-15', hora: 12 });
  });
});

describe('config/cors', () => {
  test('sin CORS_ORIGINS permite cualquier origen', () => {
    expect(origenesPermitidos({})).toBeNull();
    expect(opcionesCors({}).origin).toBe(true);
    expect(opcionesSocketCors({}).origin).toBe('*');
  });

  test('con CORS_ORIGINS restringe a la lista (y expone las cabeceras propias)', () => {
    const env = { CORS_ORIGINS: 'https://a.cl, https://b.cl ,' };
    expect(origenesPermitidos(env)).toEqual(['https://a.cl', 'https://b.cl']);
    expect(opcionesCors(env).origin).toEqual(['https://a.cl', 'https://b.cl']);
    expect(opcionesCors(env).exposedHeaders).toContain('X-Next-Cursor');
    expect(opcionesSocketCors(env).origin).toEqual(['https://a.cl', 'https://b.cl']);
  });
});

describe('config/env', () => {
  test('falla si faltan JWT_SECRET o DATABASE_URL', () => {
    expect(() => validarEntorno({})).toThrow(/JWT_SECRET, DATABASE_URL/);
    expect(() => validarEntorno({ JWT_SECRET: 'x'.repeat(40) })).toThrow(/DATABASE_URL/);
  });

  test('en producción exige un JWT_SECRET largo', () => {
    expect(() => validarEntorno({ NODE_ENV: 'production', JWT_SECRET: 'corto', DATABASE_URL: 'postgres://x' })).toThrow(/32 caracteres/);
    expect(() => validarEntorno({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32), DATABASE_URL: 'postgres://x' })).not.toThrow();
    expect(() => validarEntorno({ JWT_SECRET: 'corto', DATABASE_URL: 'postgres://x' })).not.toThrow();
  });
});
