jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const bcrypt = require('bcrypt');
const request = require('supertest');
const pool = require('../../src/config/db');
const app = require('../../src/app');
const { tokenChofer } = require('../testUtils');

const DATOS_EMPRESA = {
  empresa: {
    rut: '76.086.428-5',
    razon_social: 'Constructora Andes SpA',
    giro: 'Construcción de obras civiles',
    nombre_fantasia: 'Andes',
    direccion: 'Av. Libertador Bernardo O\'Higgins 1234',
    comuna: 'Santiago',
    region: 'Metropolitana',
    email_contacto: 'Contacto@Andes.cl',
    telefono: '+56912345678',
    representante_legal: { nombre: 'María Soto', rut: '12345678-5' },
  },
  usuario: { nombre: 'Pedro Admin', rut: '11111111-1', email: 'Pedro@Andes.cl', password: 'clave-segura-123' },
};

const clonar = (obj) => JSON.parse(JSON.stringify(obj));

describe('POST /api/auth/registrar-empresa', () => {
  beforeEach(() => pool.query.mockReset());

  test('201 crea la empresa y su administrador LOGISTICA en una sola sentencia', async () => {
    pool.query.mockResolvedValue({
      rows: [
        {
          id: 'usuario-1', rol: 'LOGISTICA', nombre: 'Pedro Admin', rut: '11111111-1', email: 'pedro@andes.cl',
          empresa_id: 'empresa-1', comuna_id: null, tipo_persona: 'EMPRESA',
          rut_empresa: '76086428-5', empresa_razon_social: 'Constructora Andes SpA', empresa_nombre_fantasia: 'Andes',
        },
      ],
    });

    const res = await request(app).post('/api/auth/registrar-empresa').send(DATOS_EMPRESA);

    expect(res.status).toBe(201);
    expect(res.body.usuario.rol).toBe('LOGISTICA');
    expect(res.body.empresa).toEqual({
      id: 'empresa-1', rut: '76086428-5', razon_social: 'Constructora Andes SpA', nombre_fantasia: 'Andes',
    });
    expect(res.body.token).toBeDefined();
    expect(res.body.usuario.password_hash).toBeUndefined();

    // Una sola consulta (atómica) y datos normalizados: RUT sin puntos, emails en minúsculas.
    expect(pool.query).toHaveBeenCalledTimes(1);
    const params = pool.query.mock.calls[0][1];
    expect(params).toContain('76086428-5');
    expect(params).toContain('contacto@andes.cl');
    expect(params).toContain('pedro@andes.cl');
  });

  test('400 si el RUT de la empresa es inválido', async () => {
    const datos = clonar(DATOS_EMPRESA);
    datos.empresa.rut = '76086428-0';
    const res = await request(app).post('/api/auth/registrar-empresa').send(datos);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/RUT de la empresa/i);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('400 si el RUT del representante legal es inválido', async () => {
    const datos = clonar(DATOS_EMPRESA);
    datos.empresa.representante_legal.rut = '12345678-9';
    const res = await request(app).post('/api/auth/registrar-empresa').send(datos);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/representante/i);
  });

  test('400 si el RUT del usuario es inválido', async () => {
    const datos = clonar(DATOS_EMPRESA);
    datos.usuario.rut = '11111111-2';
    const res = await request(app).post('/api/auth/registrar-empresa').send(datos);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/RUT del usuario/i);
  });

  test('400 si la contraseña tiene menos de 8 caracteres', async () => {
    const datos = clonar(DATOS_EMPRESA);
    datos.usuario.password = 'corta';
    const res = await request(app).post('/api/auth/registrar-empresa').send(datos);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 caracteres/);
  });

  test('400 si falta un campo obligatorio de la empresa', async () => {
    const datos = clonar(DATOS_EMPRESA);
    delete datos.empresa.giro;
    const res = await request(app).post('/api/auth/registrar-empresa').send(datos);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/giro/);
  });

  test('400 si no vienen empresa y usuario', async () => {
    const res = await request(app).post('/api/auth/registrar-empresa').send({});
    expect(res.status).toBe(400);
  });

  test('409 con mensaje claro si ya existe una empresa con ese RUT (sin filtrar el detail de Postgres)', async () => {
    pool.query.mockRejectedValue(
      Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'empresa_rut_empresa_key',
        detail: 'Key (rut_empresa)=(76086428-5) already exists.',
      })
    );

    const res = await request(app).post('/api/auth/registrar-empresa').send(DATOS_EMPRESA);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Ya existe una empresa registrada con ese RUT');
    expect(JSON.stringify(res.body)).not.toMatch(/Key \(/);
  });

  test('409 si el email del administrador ya tiene cuenta', async () => {
    pool.query.mockRejectedValue(
      Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'usuario_email_key' })
    );
    const res = await request(app).post('/api/auth/registrar-empresa').send(DATOS_EMPRESA);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/email/i);
  });
});

describe('POST /api/auth/registrar', () => {
  beforeEach(() => pool.query.mockReset());

  const cuenta = { nombre: 'Juan', rut: '11111111-1', email: 'Juan@Test.cl', password: 'clave-segura-1' };

  test('403 si intenta registrarse como operador municipal', async () => {
    const res = await request(app)
      .post('/api/auth/registrar')
      .send({ ...cuenta, rol: 'OPERADOR_MUNICIPAL', comuna_id: 'comuna-1' });
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('403 si intenta registrarse como inspector municipal', async () => {
    const res = await request(app)
      .post('/api/auth/registrar')
      .send({ ...cuenta, rol: 'INSPECTOR_MUNICIPAL', comuna_id: 'comuna-1' });
    expect(res.status).toBe(403);
  });

  test('400 si pide registrarse como persona natural', async () => {
    const res = await request(app)
      .post('/api/auth/registrar')
      .send({ ...cuenta, rol: 'CHOFER', tipo_persona: 'NATURAL' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/empresas/i);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('400 si falta empresa_id', async () => {
    const res = await request(app).post('/api/auth/registrar').send({ ...cuenta, rol: 'CHOFER' });
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('400 si la contraseña es corta o el RUT inválido', async () => {
    const corta = await request(app)
      .post('/api/auth/registrar')
      .send({ ...cuenta, rol: 'CHOFER', empresa_id: 'empresa-1', password: '1234' });
    expect(corta.status).toBe(400);

    const rutMalo = await request(app)
      .post('/api/auth/registrar')
      .send({ ...cuenta, rol: 'CHOFER', empresa_id: 'empresa-1', rut: '11111111-9' });
    expect(rutMalo.status).toBe(400);
  });

  test('201 registra un CHOFER en una empresa existente, con el email en minúsculas', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'chofer-1', rol: 'CHOFER', nombre: 'Juan', rut: '11111111-1', email: 'juan@test.cl', empresa_id: 'empresa-1', comuna_id: null, tipo_persona: 'EMPRESA' }],
      });

    const res = await request(app)
      .post('/api/auth/registrar')
      .send({ ...cuenta, rol: 'CHOFER', empresa_id: 'empresa-1' });

    expect(res.status).toBe(201);
    expect(res.body.usuario.empresa_id).toBe('empresa-1');
    expect(pool.query.mock.calls[1][1]).toContain('juan@test.cl');
  });

  test('409 sin filtrar el detail si el email ya existe', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'empresa-1' }] })
      .mockRejectedValueOnce(
        Object.assign(new Error('dup'), { code: '23505', constraint: 'usuario_email_key', detail: 'Key (email)=(juan@test.cl) already exists.' })
      );

    const res = await request(app)
      .post('/api/auth/registrar')
      .send({ ...cuenta, rol: 'CHOFER', empresa_id: 'empresa-1' });

    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).not.toMatch(/juan@test\.cl/);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => pool.query.mockReset());

  test('401 con credenciales inválidas', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const res = await request(app).post('/api/auth/login').send({ email: 'x@test.cl', password: 'lo-que-sea' });

    expect(res.status).toBe(401);
  });

  test('200, busca el email en minúsculas y no expone password_hash', async () => {
    const password_hash = await bcrypt.hash('clave123', 10);
    pool.query.mockResolvedValue({ rows: [{ id: 'chofer-1', rol: 'CHOFER', empresa_id: 'empresa-1', comuna_id: null, password_hash }] });

    const res = await request(app).post('/api/auth/login').send({ email: ' Juan@Test.cl ', password: 'clave123' });

    expect(res.status).toBe(200);
    expect(res.body.usuario.password_hash).toBeUndefined();
    expect(res.body.token).toBeDefined();
    expect(pool.query.mock.calls[0][1]).toEqual(['juan@test.cl']);
  });
});

describe('GET /api/auth/me', () => {
  beforeEach(() => pool.query.mockReset());

  test('401 sin token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('200 con el perfil y los datos de su empresa', async () => {
    pool.query.mockResolvedValue({
      rows: [
        {
          id: 'chofer-1', rol: 'LOGISTICA', nombre: 'Juan', rut: '11111111-1', email: 'juan@test.cl',
          empresa_id: 'empresa-1', comuna_id: null, tipo_persona: 'EMPRESA',
          empresa_rut: '76086428-5', empresa_razon_social: 'Constructora Andes SpA', empresa_nombre: 'Andes', empresa_nombre_fantasia: 'Andes',
        },
      ],
    });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenChofer()}`);

    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Juan');
    expect(res.body.empresa).toEqual({
      id: 'empresa-1', rut: '76086428-5', razon_social: 'Constructora Andes SpA', nombre_fantasia: 'Andes',
    });
    expect(res.body.empresa_rut).toBeUndefined();
  });

  test('empresa:null para cuentas municipales', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 'op-1', rol: 'OPERADOR_MUNICIPAL', nombre: 'Ana', rut: '12345678-5', email: 'ana@muni.cl', empresa_id: null, comuna_id: 'comuna-1', tipo_persona: 'EMPRESA' }],
    });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenChofer()}`);
    expect(res.status).toBe(200);
    expect(res.body.empresa).toBeNull();
  });

  test('404 si el usuario del token ya no existe', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenChofer()}`);

    expect(res.status).toBe(404);
  });
});
