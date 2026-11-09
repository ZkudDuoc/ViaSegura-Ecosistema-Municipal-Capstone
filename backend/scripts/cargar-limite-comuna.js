#!/usr/bin/env node
// Carga (o reemplaza) el contorno de una comuna desde un archivo GeoJSON, por
// ejemplo el límite comunal oficial de IDE Chile o de la BCN.
//
//   node scripts/cargar-limite-comuna.js --comuna "Santiago Centro" \
//     --archivo data/limites/santiago-centro.geojson --habilitar
//
// El archivo puede ser un Polygon/MultiPolygon, un Feature o un
// FeatureCollection (se usa la primera geometría de área). Debe venir en
// EPSG:4326 (lon/lat). Con --habilitar la comuna queda disponible para reservar;
// sin él solo se guarda el contorno.
require('dotenv').config();
const fs = require('fs');
const { esUuid } = require('../src/utils/validar');

function extraerGeometria(geojson) {
  const candidatos =
    geojson?.type === 'FeatureCollection' ? geojson.features.map((f) => f.geometry) : [geojson?.type === 'Feature' ? geojson.geometry : geojson];
  const geometria = candidatos.find((g) => g && ['Polygon', 'MultiPolygon'].includes(g.type));
  if (!geometria) throw new Error('El archivo no contiene un Polygon ni un MultiPolygon');
  return geometria;
}

function leerArgumentos(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const siguiente = argv[i + 1];
    if (siguiente === undefined || siguiente.startsWith('--')) args[argv[i].slice(2)] = true;
    else {
      args[argv[i].slice(2)] = siguiente;
      i++;
    }
  }
  return args;
}

async function cargarLimite({ comuna, geometria, habilitar }, pool) {
  const { rows } = await pool.query(
    `UPDATE comuna
     SET limite = ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))),
         habilitada = CASE WHEN $2::boolean THEN true ELSE habilitada END
     WHERE ${esUuid(comuna) ? 'id = $3' : 'nombre = $3'}
     RETURNING id, nombre, habilitada, ST_NPoints(limite) AS vertices, round((ST_Area(limite::geography) / 1000000)::numeric, 2) AS km2`,
    [JSON.stringify(geometria), Boolean(habilitar), comuna]
  );
  if (!rows[0]) throw new Error(`No existe la comuna "${comuna}"`);
  return rows[0];
}

async function main() {
  const args = leerArgumentos(process.argv.slice(2));
  if (!args.comuna || !args.archivo) {
    console.error('Uso: node scripts/cargar-limite-comuna.js --comuna "Santiago Centro" --archivo limite.geojson [--habilitar]');
    process.exitCode = 1;
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error('Error: falta DATABASE_URL (backend/.env).');
    process.exitCode = 1;
    return;
  }

  const pool = require('../src/config/db');
  try {
    const geometria = extraerGeometria(JSON.parse(fs.readFileSync(args.archivo, 'utf8')));
    const resultado = await cargarLimite({ comuna: args.comuna, geometria, habilitar: args.habilitar === true }, pool);
    console.log('Contorno cargado:', resultado);
  } catch (err) {
    console.error(`Error: ${err.message || err.code || 'error desconocido'}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { extraerGeometria, leerArgumentos, cargarLimite };
