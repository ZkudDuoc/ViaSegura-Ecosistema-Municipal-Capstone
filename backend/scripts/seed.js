require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../src/config/db');

const SEED_PASSWORD = 'Password123!';

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [comuna] } = await client.query(`
      INSERT INTO comuna (nombre, region, codigo_ine)
      VALUES ('Santiago', 'Metropolitana', '13101')
      ON CONFLICT (codigo_ine) DO UPDATE SET nombre = EXCLUDED.nombre
      RETURNING id;
    `);

    const { rows: [empresa] } = await client.query(`
      INSERT INTO empresa (rut, razon_social, comuna_id, direccion, email)
      VALUES ('76123456-7', 'Transportes Demo SpA', $1, 'Av. Siempre Viva 123', 'contacto@transportesdemo.cl')
      ON CONFLICT (rut) DO UPDATE SET razon_social = EXCLUDED.razon_social
      RETURNING id;
    `, [comuna.id]);

    const { rows: roles } = await client.query('SELECT id, nombre FROM rol');
    const rolByName = Object.fromEntries(roles.map((r) => [r.nombre, r.id]));

    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

    const usuarios = [
      { nombre: 'Chofer Demo', email: 'chofer@demo.cl', rol: 'CHOFER_LOGISTICA', empresa_id: empresa.id },
      { nombre: 'Inspector Demo', email: 'inspector@demo.cl', rol: 'INSPECTOR', empresa_id: null },
      { nombre: 'Operador Demo', email: 'operador@demo.cl', rol: 'OPERADOR_CENTRAL', empresa_id: null },
      { nombre: 'Supervisor Demo', email: 'supervisor@demo.cl', rol: 'SUPERVISOR', empresa_id: null },
    ];

    for (const u of usuarios) {
      await client.query(`
        INSERT INTO usuario (empresa_id, rol_id, nombre, email, password_hash)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (email) DO NOTHING;
      `, [u.empresa_id, rolByName[u.rol], u.nombre, u.email, passwordHash]);
    }

    await client.query('COMMIT');
    console.log('Seed aplicado. Usuarios de prueba (password para todos: %s):', SEED_PASSWORD);
    usuarios.forEach((u) => console.log(`  - ${u.email} (${u.rol})`));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Error en seed:', err.message);
  process.exit(1);
});
