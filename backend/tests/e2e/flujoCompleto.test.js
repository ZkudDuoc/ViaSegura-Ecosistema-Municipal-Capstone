// E2E de la API completa (Semana 4): recorre un flujo real de punta a punta
// —login, vehículo, creación de permiso, aprobación, activación, validación
// de patente en terreno, estado operativo y revocación— encadenando llamadas
// HTTP reales (supertest) contra la app Express real. Como no hay una base
// de datos de test conectada, `pg` se reemplaza por una base en memoria muy
// simple que entiende las consultas que realmente usa el backend (empareja
// por fragmentos característicos del SQL, no por orden de llamada), para que
// el test no sea frágil ante cambios internos de implementación.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../../src/config/db', () => ({ query: jest.fn() }));
jest.mock('../../src/services/riskService', () => ({ evaluarRiesgo: jest.fn() }));

const bcrypt = require('bcrypt');
const request = require('supertest');
const pool = require('../../src/config/db');
const riskService = require('../../src/services/riskService');
const app = require('../../src/app');

const EMPRESA_ID = 'empresa-1';
const COMUNA_ID = 'comuna-1';
const CHOFER_ID = 'chofer-1';
const OPERADOR_ID = 'operador-1';
const VEHICULO_ID = 'vehiculo-1';
const PERMISO_ID = 'permiso-1';
const PATENTE = 'ABCD12';

describe('E2E: ciclo de vida completo de un permiso', () => {
  let passwordHash;
  let choferToken;
  let operadorToken;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('clave-segura', 10);
  });

  beforeEach(() => {
    pool.query.mockReset();
    riskService.evaluarRiesgo.mockReset();

    pool.query.mockImplementation((text, params = []) => {
      // ---- auth ----
      if (text.includes('SELECT * FROM usuario WHERE email')) {
        return { rows: [{ id: CHOFER_ID, rol: 'CHOFER', empresa_id: EMPRESA_ID, comuna_id: null, password_hash: passwordHash }] };
      }
      if (text.includes('FROM usuario WHERE id = $1') && text.includes('tipo_persona')) {
        return { rows: [{ id: CHOFER_ID, rol: 'CHOFER', nombre: 'Juan Chofer', rut: '11111111-1', email: 'chofer@test.cl', empresa_id: EMPRESA_ID, comuna_id: null, tipo_persona: 'EMPRESA' }] };
      }

      // ---- vehiculo ----
      if (text.includes('INSERT INTO vehiculo')) {
        return { rows: [{ id: VEHICULO_ID, patente: params[0], alto_m: params[1], ancho_m: params[2], largo_m: params[3], peso_ton: params[4], empresa_id: params[5], usuario_id: params[6] }] };
      }

      // ---- creación de permiso (fn_crear_permiso) ----
      if (text.includes('fn_crear_permiso')) {
        return {
          rows: [{
            id: PERMISO_ID,
            usuario_id: CHOFER_ID,
            comuna_id: COMUNA_ID,
            estado: 'PENDIENTE_CONFIRMACION_MUNICIPAL',
            motivo_cola: null,
            ventana_fin: '2026-01-01T18:00:00Z',
          }],
        };
      }
      if (text.includes('UPDATE permiso SET vehiculo_id')) {
        return { rows: [{ id: PERMISO_ID, usuario_id: CHOFER_ID, comuna_id: COMUNA_ID, estado: 'PENDIENTE_CONFIRMACION_MUNICIPAL', motivo_cola: null, vehiculo_id: VEHICULO_ID, ventana_fin: '2026-01-01T18:00:00Z' }] };
      }
      if (text.includes('INSERT INTO evaluacion_riesgo')) {
        return { rows: [{ id: 'eval-1' }] };
      }

      // ---- aprobar / activar ----
      if (text.includes("SET estado = 'APROBADO'")) {
        return { rows: [{ id: PERMISO_ID, estado: 'APROBADO' }] };
      }
      if (text.includes("SET estado = 'ACTIVO'")) {
        return { rows: [{ id: PERMISO_ID, estado: 'ACTIVO', geofencing_confirmado_at: new Date().toISOString() }] };
      }

      // ---- validar patente ----
      if (text.includes('LEFT JOIN vehiculo v')) {
        return { rows: [{ permiso_id: PERMISO_ID, comuna_id: COMUNA_ID, vehiculo_id: VEHICULO_ID, patente: PATENTE }] };
      }

      // ---- operativo ----
      if (text.includes('geofencing_confirmado_at, ventana_fin') && text.includes('WHERE id = $1')) {
        return {
          rows: [{
            id: PERMISO_ID,
            comuna_id: COMUNA_ID,
            usuario_id: CHOFER_ID,
            estado: 'ACTIVO',
            geofencing_confirmado_at: new Date(Date.now() - 5 * 60000).toISOString(),
            ventana_fin: new Date(Date.now() + 55 * 60000).toISOString(),
          }],
        };
      }

      // ---- revocar ----
      if (text.includes("SET estado = 'REVOCADO'")) {
        return { rows: [{ id: PERMISO_ID, estado: 'REVOCADO', revocado_por: OPERADOR_ID, revocado_at: new Date().toISOString() }] };
      }

      // ---- bitácora (validar-patente y revocar insertan aquí) ----
      if (text.includes('INSERT INTO historial_eventos')) {
        return { rows: [{ id: 'evento-1', created_at: new Date().toISOString() }] };
      }

      throw new Error(`Query no esperada en el E2E: ${text}`);
    });
  });

  test('login -> vehículo -> permiso -> aprobar -> activar -> validar patente -> operativo -> revocar', async () => {
    // 1) Login del chofer
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'chofer@test.cl', password: 'clave-segura' });
    expect(loginRes.status).toBe(200);
    choferToken = loginRes.body.token;
    expect(loginRes.body.usuario.password_hash).toBeUndefined();

    // 2) GET /me confirma la sesión
    const meRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${choferToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.id).toBe(CHOFER_ID);

    // 3) Registra el vehículo de la empresa
    const vehiculoRes = await request(app)
      .post('/api/vehiculos')
      .set('Authorization', `Bearer ${choferToken}`)
      .send({ patente: PATENTE, alto_m: 4.2, ancho_m: 2.6, largo_m: 12, peso_ton: 18 });
    expect(vehiculoRes.status).toBe(201);
    expect(vehiculoRes.body.id).toBe(VEHICULO_ID);

    // 4) Crea el permiso asociado a ese vehículo (riesgo BAJO: no lo encola)
    riskService.evaluarRiesgo.mockResolvedValue({ risk_score: 0.1, congestion_score: 0.2, nivel: 'bajo' });
    const crearRes = await request(app)
      .post('/api/permisos')
      .set('Authorization', `Bearer ${choferToken}`)
      .send({
        rut_ejecutor: '11111111-1',
        comuna_id: COMUNA_ID,
        tipo_actividad: 'PROGRAMADA',
        area: [[0, 0], [0, 1], [1, 1]],
        ventana_inicio: '2026-01-01T08:00:00Z',
        ventana_fin: '2026-01-01T18:00:00Z',
        vehiculo_id: VEHICULO_ID,
      });
    expect(crearRes.status).toBe(201);
    expect(crearRes.body.estado).toBe('PENDIENTE_CONFIRMACION_MUNICIPAL');

    // El operador municipal firma su propio token (simula login ya hecho).
    const { firmarToken } = require('../../src/utils/jwt');
    operadorToken = firmarToken({ id: OPERADOR_ID, rol: 'OPERADOR_MUNICIPAL', empresa_id: null, comuna_id: COMUNA_ID });

    // 5) El operador aprueba
    const aprobarRes = await request(app)
      .patch(`/api/permisos/${PERMISO_ID}/aprobar`)
      .set('Authorization', `Bearer ${operadorToken}`);
    expect(aprobarRes.status).toBe(200);
    expect(aprobarRes.body.estado).toBe('APROBADO');

    // 6) El chofer activa en terreno
    const activarRes = await request(app)
      .patch(`/api/permisos/${PERMISO_ID}/activar`)
      .set('Authorization', `Bearer ${choferToken}`)
      .send({ foto_evidencia_url: 'https://storage.test/evidencia.jpg' });
    expect(activarRes.status).toBe(200);
    expect(activarRes.body.estado).toBe('ACTIVO');

    // 7) El inspector valida la patente escaneada contra el permiso
    const validarRes = await request(app)
      .post(`/api/permisos/${PERMISO_ID}/validar-patente`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .send({ patente: 'abcd-12' });
    expect(validarRes.status).toBe(200);
    expect(validarRes.body.coincide).toBe(true);

    // 8) Consulta el estado operativo (para la animación del mapa)
    const operativoRes = await request(app)
      .get(`/api/permisos/${PERMISO_ID}/operativo`)
      .set('Authorization', `Bearer ${choferToken}`);
    expect(operativoRes.status).toBe(200);
    expect(operativoRes.body.estado).toBe('ACTIVO');
    expect(operativoRes.body.vencido).toBe(false);

    // 9) El operador revoca el permiso
    const revocarRes = await request(app)
      .patch(`/api/permisos/${PERMISO_ID}/revocar`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .send({ motivo: 'incumplimiento en terreno' });
    expect(revocarRes.status).toBe(200);
    expect(revocarRes.body.estado).toBe('REVOCADO');
  });
});
