describe('smsService', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
  });

  test('estaConfigurado() es false sin credenciales', () => {
    const smsService = require('../../src/services/smsService');
    expect(smsService.estaConfigurado()).toBe(false);
  });

  test('enviarSMS() no envía y explica el motivo si no hay teléfonos', async () => {
    const smsService = require('../../src/services/smsService');
    const resultado = await smsService.enviarSMS([], 'hola');
    expect(resultado.enviado).toBe(false);
    expect(resultado.detalle).toMatch(/teléfonos/i);
  });

  test('enviarSMS() no envía y explica el motivo si Twilio no está configurado', async () => {
    const smsService = require('../../src/services/smsService');
    const resultado = await smsService.enviarSMS(['+56911111111'], 'hola');
    expect(resultado.enviado).toBe(false);
    expect(resultado.detalle).toMatch(/no configurado/i);
  });

  test('enviarSMS() usa el cliente Twilio cuando hay credenciales', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'token123';
    process.env.TWILIO_FROM_NUMBER = '+56900000000';

    const create = jest.fn().mockResolvedValue({ sid: 'SM123', to: '+56911111111' });
    jest.doMock('twilio', () => jest.fn(() => ({ messages: { create } })));

    const smsService = require('../../src/services/smsService');
    const resultado = await smsService.enviarSMS(['+56911111111'], 'hola');

    expect(resultado.enviado).toBe(true);
    expect(create).toHaveBeenCalledWith({
      body: 'hola',
      from: '+56900000000',
      to: '+56911111111',
    });
  });

  test('enviarSMS() reporta enviado:false si Twilio lanza error', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'token123';
    process.env.TWILIO_FROM_NUMBER = '+56900000000';

    const create = jest.fn().mockRejectedValue(new Error('rechazado por Twilio'));
    jest.doMock('twilio', () => jest.fn(() => ({ messages: { create } })));

    const smsService = require('../../src/services/smsService');
    const resultado = await smsService.enviarSMS(['+56911111111'], 'hola');

    expect(resultado.enviado).toBe(false);
    expect(resultado.detalle).toMatch(/rechazado/i);
  });
});
