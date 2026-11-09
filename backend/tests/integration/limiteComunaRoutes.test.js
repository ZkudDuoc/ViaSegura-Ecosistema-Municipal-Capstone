// La comuna limita dónde se puede reservar: tiene que estar habilitada y el
// área completa dentro de su contorno (validado en la transacción de crear).
jest.mock('../../src/config/db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../../src/services/riskService', () => ({ evaluarRiesgo: jest.fn() }));

const request = require('supertest');
const pool = require('../../src/config/db');
const riskService = require('../../src/services/riskService');
const app = require('../../src/app');
const { tokenChofer } = require('../testUtils');

const COMUNA = '3f2b8c1e-9d4a-4c7e-8b1a-2d5e6f7a8b9c';
const logistica = { Authorization: `Bearer ${tokenChofer({ id: 'logistica-1', empresa_id: 'empresa-A', rol: 'LOGISTICA' })}` };

const solicitud = {
  rut_ejecutor: '11111111-1',
  comuna_id: COMUNA,
  tipo_actividad: 'PROGRAMADA',
  area: [[-70.651, -33.438], [-70.651, -33.437], [-70.65, -33.437]],
  ventana_inicio: '2026-11-02T10:00:00Z',
  ventana_fin: '2026-11-02T18:00:00Z',
};

let consultas;
let comuna;

beforeEach(() => {
  pool.query.mockReset();
  pool.connect.mockReset();
  riskService.evaluarRiesgo.mockReset();
  consultas = [];
  comuna = { habilitada: true, dentro: true };

  const responder = (text) => {
    consultas.push(text.trim().split('\n')[0].trim());
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return { rows: [] };
    if (text.includes('FROM comuna WHERE id = $1')) return { rows: comuna ? [comuna] : [] };
    if (text.includes('fn_crear_permiso')) {
      return { rows: [{ id: 'permiso-1', usuario_id: 'logistica-1', comuna_id: COMUNA, estado: 'PENDIENTE_CONFIRMACION_MUNICIPAL' }] };
    }
    if (text.includes('INSERT INTO evaluacion_riesgo')) return { rows: [] };
    if (text.includes('riesgo_pendiente = true')) return { rows: [] };
    throw new Error(`Query no esperada: ${text}`);
  };
  pool.query.mockImplementation(async (text, params) => responder(text, params));
  pool.connect.mockResolvedValue({ query: jest.fn(async (text, params) => responder(text, params)), release: jest.fn() });
  riskService.evaluarRiesgo.mockResolvedValue({ risk_score: 10, congestion_score: 5, nivel: 'bajo' });
});

describe('POST /api/permisos — la comuna limita dónde se puede reservar', () => {
  test('422 COMUNA_NO_HABILITADA si la comuna todavía no está disponible', async () => {
    comuna = { habilitada: false, dentro: false };

    const res = await request(app).post('/api/permisos').set(logistica).send(solicitud);

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'Esta comuna todavía no está disponible', codigo: 'COMUNA_NO_HABILITADA' });
    expect(consultas).toContain('ROLLBACK');
    expect(consultas.some((c) => c.includes('fn_crear_permiso'))).toBe(false); // no se creó nada
  });

  test('una comuna no habilitada se rechaza aunque el área "caiga dentro" (la habilitación manda)', async () => {
    comuna = { habilitada: false, dentro: true };
    const res = await request(app).post('/api/permisos').set(logistica).send(solicitud);
    expect(res.body.codigo).toBe('COMUNA_NO_HABILITADA');
  });

  test('422 AREA_FUERA_DE_COMUNA si el área no está completamente dentro del contorno', async () => {
    comuna = { habilitada: true, dentro: false };

    const res = await request(app).post('/api/permisos').set(logistica).send(solicitud);

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'El área debe estar dentro de la comuna seleccionada', codigo: 'AREA_FUERA_DE_COMUNA' });
    expect(consultas).toContain('ROLLBACK');
    expect(consultas.some((c) => c.includes('fn_crear_permiso'))).toBe(false);
    expect(riskService.evaluarRiesgo).not.toHaveBeenCalled();
  });

  test('400 si la comuna no existe', async () => {
    comuna = null;
    const res = await request(app).post('/api/permisos').set(logistica).send(solicitud);
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBeUndefined();
  });

  test('201 si la comuna está habilitada y el área queda dentro', async () => {
    const res = await request(app).post('/api/permisos').set(logistica).send(solicitud);
    expect(res.status).toBe(201);
    expect(consultas).toEqual(expect.arrayContaining(['BEGIN', 'COMMIT']));
  });

  test('la validación ocurre DENTRO de la transacción y ANTES de fn_crear_permiso, con el polígono ya cerrado', async () => {
    await request(app).post('/api/permisos').set(logistica).send(solicitud);

    const cliente = await pool.connect.mock.results[0].value;
    const [sql, params] = cliente.query.mock.calls.find(([text]) => text.includes('FROM comuna WHERE id = $1'));
    expect(sql).toMatch(/ST_Within\(ST_GeomFromText\(\$2, 4326\), limite\)/);
    expect(sql).toMatch(/limite IS NOT NULL/);
    expect(params[0]).toBe(COMUNA);
    expect(params[1]).toBe('POLYGON((-70.651 -33.438, -70.651 -33.437, -70.65 -33.437, -70.651 -33.438))');

    const orden = cliente.query.mock.calls.map(([text]) => text.trim().split('\n')[0].trim());
    expect(orden.indexOf('BEGIN')).toBeLessThan(orden.findIndex((c) => c.includes('FROM comuna') || c.startsWith('SELECT habilitada')));
    expect(orden.findIndex((c) => c.startsWith('SELECT habilitada'))).toBeLessThan(orden.findIndex((c) => c.includes('fn_crear_permiso')));
  });

  test('los errores de comuna no se registran como fallas del servidor (no es un 500)', async () => {
    comuna = { habilitada: true, dentro: false };
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await request(app).post('/api/permisos').set(logistica).send(solicitud);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('GET /api/comunas (público)', () => {
  test('incluye habilitada y el contorno en GeoJSON; las comunas sin contorno traen limite null', async () => {
    pool.query.mockReset();
    const contorno = { type: 'MultiPolygon', coordinates: [[[[-70.7, -33.5], [-70.6, -33.5], [-70.6, -33.4], [-70.7, -33.5]]]] };
    pool.query.mockResolvedValue({
      rows: [
        { id: 'a', nombre: 'Providencia', sla_confirmacion_min: 30, sla_escolta_min: 60, habilitada: false, limite: null },
        { id: 'b', nombre: 'San Joaquín', sla_confirmacion_min: 30, sla_escolta_min: 60, habilitada: false, limite: null },
        { id: 'c', nombre: 'Santiago Centro', sla_confirmacion_min: 30, sla_escolta_min: 60, habilitada: true, limite: contorno },
      ],
    });

    const res = await request(app).get('/api/comunas');

    expect(res.status).toBe(200);
    expect(res.body.map((c) => c.nombre)).toEqual(['Providencia', 'San Joaquín', 'Santiago Centro']);
    expect(res.body[2]).toEqual(expect.objectContaining({ habilitada: true, limite: contorno }));
    expect(res.body[0]).toEqual(expect.objectContaining({ habilitada: false, limite: null }));
    expect(pool.query.mock.calls[0][0]).toMatch(/ST_AsGeoJSON\(limite\)::json AS limite/);
  });
});
