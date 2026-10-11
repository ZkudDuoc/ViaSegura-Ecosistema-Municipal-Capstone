const bcrypt = require('bcrypt');
const { crearUsuarioMunicipal, leerArgumentos } = require('../../scripts/crear-usuario-municipal');

const datos = {
  rol: 'OPERADOR_MUNICIPAL',
  nombre: 'Ana Pérez',
  rut: '12.345.678-5',
  email: 'Ana@Municipalidad.cl',
  password: 'clave-segura-123',
  comuna: 'Santiago Centro',
};

const COMUNA_ID = '3f2b8c1e-9d4a-4c7e-8b1a-2d5e6f7a8b9c';

function poolFalso({ comunaEncontrada = true } = {}) {
  return {
    query: jest.fn(async (sql, params) => {
      if (sql.includes('FROM comuna')) return { rows: comunaEncontrada ? [{ id: COMUNA_ID, nombre: 'Santiago Centro' }] : [] };
      return { rows: [{ id: 'usuario-1', rol: params[0], nombre: params[1], rut: params[2], email: params[3], comuna_id: params[5] }] };
    }),
  };
}

describe('leerArgumentos', () => {
  test('lee pares --clave valor', () => {
    expect(leerArgumentos(['--rol', 'INSPECTOR_MUNICIPAL', '--comuna', 'Santiago Centro'])).toEqual({
      rol: 'INSPECTOR_MUNICIPAL',
      comuna: 'Santiago Centro',
    });
  });
});

describe('crearUsuarioMunicipal', () => {
  test('crea la cuenta con RUT normalizado, email en minúsculas y contraseña hasheada', async () => {
    const pool = poolFalso();

    const usuario = await crearUsuarioMunicipal(datos, pool);

    expect(usuario).toEqual(expect.objectContaining({ rol: 'OPERADOR_MUNICIPAL', rut: '12345678-5', email: 'ana@municipalidad.cl', comuna: 'Santiago Centro' }));
    const insert = pool.query.mock.calls[1][1];
    expect(insert[5]).toBe(COMUNA_ID);
    expect(insert[4]).not.toBe(datos.password);
    expect(await bcrypt.compare(datos.password, insert[4])).toBe(true);
  });

  test('resuelve la comuna por UUID cuando se entrega uno', async () => {
    const pool = poolFalso();
    await crearUsuarioMunicipal({ ...datos, comuna: COMUNA_ID }, pool);
    expect(pool.query.mock.calls[0][0]).toMatch(/WHERE id = \$1/);
  });

  test.each([
    [{ rol: 'LOGISTICA' }, /--rol/],
    [{ rol: 'CHOFER' }, /--rol/],
    [{ nombre: '' }, /--nombre/],
    [{ rut: '12345678-9' }, /--rut/],
    [{ email: 'no-es-email' }, /--email/],
    [{ password: 'corta' }, /--password/],
    [{ comuna: '' }, /--comuna/],
  ])('rechaza datos inválidos %j', async (cambio, mensaje) => {
    const pool = poolFalso();
    await expect(crearUsuarioMunicipal({ ...datos, ...cambio }, pool)).rejects.toThrow(mensaje);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('falla si la comuna no existe', async () => {
    await expect(crearUsuarioMunicipal(datos, poolFalso({ comunaEncontrada: false }))).rejects.toThrow(/No existe la comuna/);
  });
});
