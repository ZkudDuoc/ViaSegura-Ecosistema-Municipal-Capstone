const { crearRateLimiter } = require('../../src/middleware/rateLimiter');

function mockReqRes(ip) {
  const req = { ip, socket: {} };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  return { req, res };
}

describe('crearRateLimiter', () => {
  test('permite hasta maxIntentos y luego bloquea con 429', () => {
    const limiter = crearRateLimiter({ ventanaMs: 60000, maxIntentos: 3, mensaje: 'Muy rápido' });
    const next = jest.fn();

    for (let i = 0; i < 3; i++) {
      const { req, res } = mockReqRes('1.2.3.4');
      limiter(req, res, next);
    }
    expect(next).toHaveBeenCalledTimes(3);

    const { req, res } = mockReqRes('1.2.3.4');
    limiter(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: 'Muy rápido' });
  });

  test('cuentas separadas por IP', () => {
    const limiter = crearRateLimiter({ ventanaMs: 60000, maxIntentos: 1 });
    const next = jest.fn();

    const a = mockReqRes('1.1.1.1');
    limiter(a.req, a.res, next);
    const b = mockReqRes('2.2.2.2');
    limiter(b.req, b.res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(a.res.status).not.toHaveBeenCalled();
    expect(b.res.status).not.toHaveBeenCalled();
  });
});
