jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const pool = require('../../src/config/db');
const bitacoraService = require('../../src/services/bitacoraService');

describe('bitacoraService', () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  test('registrarEvento inserta en historial_eventos con los campos dados', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'ev-1', created_at: '2026-01-01T00:00:00Z' }] });

    const resultado = await bitacoraService.registrarEvento({
      permisoId: 'permiso-1',
      comunaId: 'comuna-1',
      tipoEvento: 'REVOCACION_PERMISO',
      accion: 'REVOCAR',
      detalle: { motivo: 'incumplimiento' },
      actorId: 'operador-1',
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO historial_eventos'),
      ['permiso-1', 'comuna-1', 'REVOCACION_PERMISO', 'REVOCAR', { motivo: 'incumplimiento' }, 'operador-1']
    );
    expect(resultado).toEqual({ id: 'ev-1', created_at: '2026-01-01T00:00:00Z' });
  });

  test('listarPorPermiso consulta ordenado ascendente por fecha', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    await bitacoraService.listarPorPermiso('permiso-1');

    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY created_at ASC'), ['permiso-1']);
  });

  test('listarPorComuna consulta ordenado descendente y respeta el límite', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    await bitacoraService.listarPorComuna('comuna-1', { limit: 10 });

    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY created_at DESC'), ['comuna-1', 10]);
  });
});
