process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const jwt = require('jsonwebtoken');
const pool = require('../../src/config/db');
const codigoChoferService = require('../../src/services/codigoChoferService');

beforeEach(() => pool.query.mockReset());

describe('generarCodigo', () => {
  test('inserta un código largo (32 hex) ligado al permiso, con expiración a 24h', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'cc-1', codigo: 'abc', expira_at: '2026-01-02' }] });

    await codigoChoferService.generarCodigo('permiso-1', 'logistica-1');

    const [permisoId, codigo, horas, creadoPor] = pool.query.mock.calls[0][1];
    expect(permisoId).toBe('permiso-1');
    expect(codigo).toMatch(/^[0-9a-f]{32}$/);
    expect(horas).toBe(24);
    expect(creadoPor).toBe('logistica-1');
  });
});

describe('canjearCodigo', () => {
  test('falla si el código no existe, ya se usó, o expiró', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const resultado = await codigoChoferService.canjearCodigo('codigo-invalido');

    expect(resultado.ok).toBe(false);
    expect(resultado.error).toMatch(/inválido|utilizado|expirado/i);
  });

  test('marca el código usado (un solo uso) y devuelve un token de sesión limitada', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'cc-1', permiso_id: 'permiso-1' }] });

    const resultado = await codigoChoferService.canjearCodigo('codigo-valido');

    expect(resultado.ok).toBe(true);
    expect(resultado.permisoId).toBe('permiso-1');

    const payload = jwt.verify(resultado.token, process.env.JWT_SECRET);
    expect(payload.tipo).toBe('CODIGO_CHOFER');
    expect(payload.permisoId).toBe('permiso-1');

    // El UPDATE debe exigir usado=false y no vencido -> un solo uso.
    expect(pool.query.mock.calls[0][0]).toMatch(/usado = false AND expira_at > now\(\)/);
  });
});
