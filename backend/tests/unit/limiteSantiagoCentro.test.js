// Calidad de los datos del contorno de Santiago Centro y del script de carga.
// (Sin PostGIS en los tests: se verifica la geometría con geometría plana.)
const fs = require('fs');
const path = require('path');
const { extraerGeometria, leerArgumentos, cargarLimite } = require('../../scripts/cargar-limite-comuna');

const raiz = path.join(__dirname, '..', '..');
const feature = JSON.parse(fs.readFileSync(path.join(raiz, 'data', 'limites', 'santiago-centro.geojson'), 'utf8'));
const anillo = feature.geometry.coordinates[0];

function dentro([x, y], poligono) {
  let adentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, yi] = poligono[i];
    const [xj, yj] = poligono[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) adentro = !adentro;
  }
  return adentro;
}

// Área aproximada en km² (proyección equirectangular local, suficiente para validar el orden de magnitud).
function areaKm2(poligono) {
  const lat0 = (poligono.reduce((a, [, y]) => a + y, 0) / poligono.length) * (Math.PI / 180);
  const kmPorGrado = 111.32;
  let suma = 0;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [x1, y1] = [poligono[j][0] * kmPorGrado * Math.cos(lat0), poligono[j][1] * kmPorGrado];
    const [x2, y2] = [poligono[i][0] * kmPorGrado * Math.cos(lat0), poligono[i][1] * kmPorGrado];
    suma += x1 * y2 - x2 * y1;
  }
  return Math.abs(suma) / 2;
}

describe('data/limites/santiago-centro.geojson', () => {
  test('es un Polygon con el anillo cerrado y sin coordenadas inválidas', () => {
    expect(feature.geometry.type).toBe('Polygon');
    expect(anillo.length).toBeGreaterThan(100);
    expect(anillo[0]).toEqual(anillo[anillo.length - 1]);
    for (const [x, y] of anillo) {
      expect(x).toBeGreaterThan(-71);
      expect(x).toBeLessThan(-70);
      expect(y).toBeGreaterThan(-34);
      expect(y).toBeLessThan(-33);
    }
  });

  test('tiene el tamaño de la comuna de Santiago (≈ 22 km²)', () => {
    const km2 = areaKm2(anillo);
    expect(km2).toBeGreaterThan(18);
    expect(km2).toBeLessThan(27);
  });

  test.each([
    ['Plaza de Armas', [-70.6506, -33.4378]],
    ['Palacio de La Moneda', [-70.6535, -33.4429]],
    ['Cerro Santa Lucía', [-70.6437, -33.4400]],
    ['Estación Central de Metro Universidad de Chile', [-70.6500, -33.4437]],
  ])('%s queda DENTRO', (_n, punto) => {
    expect(dentro(punto, anillo)).toBe(true);
  });

  test.each([
    ['Costanera Center (Providencia)', [-70.6066, -33.4172]],
    ['Plaza Ñuñoa (Ñuñoa)', [-70.5976, -33.4569]],
    ['Aeropuerto de Pudahuel', [-70.7858, -33.3929]],
    ['San Joaquín (Av. Departamental)', [-70.6155, -33.4930]],
    ['Las Condes (El Golf)', [-70.5950, -33.4150]],
  ])('%s queda FUERA', (_n, punto) => {
    expect(dentro(punto, anillo)).toBe(false);
  });
});

describe('migración 014', () => {
  const sql = fs.readFileSync(path.join(raiz, 'migrations', '014_limite_santiago_centro.sql'), 'utf8');

  test('carga el contorno y habilita SOLO Santiago Centro', () => {
    expect(sql).toMatch(/update comuna/i);
    expect(sql).toMatch(/habilitada = true/);
    expect(sql).toMatch(/where nombre = 'Santiago Centro'/);
    expect(sql).toMatch(/ST_Multi\(ST_MakeValid\(ST_SetSRID\(ST_GeomFromGeoJSON\(/);
  });

  test('declara la fuente y la licencia de los datos', () => {
    expect(sql).toMatch(/OpenStreetMap/);
    expect(sql).toMatch(/ODbL/);
  });

  test('el GeoJSON embebido coincide con el archivo de datos', () => {
    const embebido = /ST_GeomFromGeoJSON\('(\{.*?\})'\)/s.exec(sql)[1];
    expect(JSON.parse(embebido)).toEqual(feature.geometry);
  });
});

describe('migración 013', () => {
  const sql = fs.readFileSync(path.join(raiz, 'migrations', '013_semana6_limite_comuna_y_qr.sql'), 'utf8');

  test('agrega limite, habilitada y la restricción de habilitada con límite', () => {
    expect(sql).toMatch(/add column if not exists limite geometry\(MultiPolygon, 4326\)/);
    expect(sql).toMatch(/add column if not exists habilitada boolean not null default false/);
    expect(sql).toMatch(/check \(not habilitada or limite is not null\)/);
  });

  test('agrega Providencia y San Joaquín sin habilitar ni contorno', () => {
    expect(sql).toMatch(/'Providencia'/);
    expect(sql).toMatch(/'San Joaquín'/);
    expect(sql).not.toMatch(/habilitada\s*=\s*true/);
  });

  test('crea la tabla aparte del secreto del QR (no una columna de permiso)', () => {
    expect(sql).toMatch(/create table if not exists permiso_qr_secreto/);
    expect(sql).toMatch(/permiso_id\s+uuid primary key references permiso\(id\) on delete cascade/);
    expect(sql).not.toMatch(/alter table permiso/i);
  });
});

describe('scripts/cargar-limite-comuna', () => {
  const poligono = { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] };

  test('extraerGeometria acepta Polygon, MultiPolygon, Feature y FeatureCollection', () => {
    expect(extraerGeometria(poligono)).toEqual(poligono);
    expect(extraerGeometria({ type: 'Feature', geometry: poligono })).toEqual(poligono);
    expect(extraerGeometria({ type: 'FeatureCollection', features: [{ geometry: { type: 'Point', coordinates: [0, 0] } }, { geometry: poligono }] })).toEqual(poligono);
    const multi = { type: 'MultiPolygon', coordinates: [poligono.coordinates] };
    expect(extraerGeometria(multi)).toEqual(multi);
  });

  test('extraerGeometria rechaza archivos sin áreas', () => {
    expect(() => extraerGeometria({ type: 'Point', coordinates: [0, 0] })).toThrow(/Polygon/);
    expect(() => extraerGeometria(null)).toThrow();
  });

  test('leerArgumentos reconoce banderas sin valor (--habilitar)', () => {
    expect(leerArgumentos(['--comuna', 'Santiago Centro', '--archivo', 'a.geojson', '--habilitar'])).toEqual({
      comuna: 'Santiago Centro',
      archivo: 'a.geojson',
      habilitar: true,
    });
  });

  test('cargarLimite actualiza por nombre, habilita solo si se pide y falla si la comuna no existe', async () => {
    const pool = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'c', nombre: 'Santiago Centro', habilitada: true, vertices: 4, km2: '22.1' }] }) };

    const resultado = await cargarLimite({ comuna: 'Santiago Centro', geometria: poligono, habilitar: true }, pool);

    expect(resultado.habilitada).toBe(true);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/WHERE nombre = \$3/);
    expect(sql).toMatch(/ST_Multi\(ST_MakeValid/);
    expect(params).toEqual([JSON.stringify(poligono), true, 'Santiago Centro']);

    await cargarLimite({ comuna: 'Santiago Centro', geometria: poligono }, pool);
    expect(pool.query.mock.calls[1][1][1]).toBe(false);

    pool.query.mockResolvedValue({ rows: [] });
    await expect(cargarLimite({ comuna: 'Inexistente', geometria: poligono }, pool)).rejects.toThrow(/No existe la comuna/);
  });

  test('acepta el UUID de la comuna', async () => {
    const pool = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'x' }] }) };
    await cargarLimite({ comuna: '3f2b8c1e-9d4a-4c7e-8b1a-2d5e6f7a8b9c', geometria: poligono }, pool);
    expect(pool.query.mock.calls[0][0]).toMatch(/WHERE id = \$3/);
  });
});
