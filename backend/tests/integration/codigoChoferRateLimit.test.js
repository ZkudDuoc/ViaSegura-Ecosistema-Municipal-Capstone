// Aislado en su propio archivo: agota el rate limiter (estado en memoria por
// IP, compartido entre requests dentro del mismo proceso) sin interferir con
// otros tests del endpoint público de canje.
jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const pool = require('../../src/config/db');
const app = require('../../src/app');

test('bloquea con 429 tras demasiados intentos de canje desde la misma IP', async () => {
  pool.query.mockResolvedValue({ rows: [] });

  let ultimo;
  for (let i = 0; i < 10; i++) {
    ultimo = await request(app).post('/api/codigo-chofer/canjear').send({ codigo: 'x' });
  }

  expect(ultimo.status).toBe(429);
});
