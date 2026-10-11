// Variables de entorno comunes a todos los tests (se ejecuta antes de cargar cualquier módulo).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
// Los tests hacen muchas llamadas seguidas a login/registro desde la misma IP.
process.env.RATE_LIMIT_AUTH_MAX = process.env.RATE_LIMIT_AUTH_MAX || '10000';
