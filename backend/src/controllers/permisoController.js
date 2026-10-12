const pool = require('../config/db');
const bitacoraService = require('../services/bitacoraService');
const { emitirEventoSolicitud } = require('../services/eventosService');
const { evaluarYRegistrar, marcarRiesgoPendiente } = require('../services/riesgoPermisoService');
const { verificarToken, firmarTokenQr } = require('../utils/jwt');
const { fechaYHoraSantiago } = require('../utils/fechas');
const { esUuid, fechaIso, errorHttp } = require('../utils/validar');
const documentoService = require('../services/documentoService');

const ESTADOS_RECHAZADO = ['RECHAZADO'];
const ESTADOS_APROBADO_O_POSTERIOR = [
  'APROBADO',
  'ACTIVO',
  'ACTIVO_PENDIENTE_EVIDENCIA',
  'FINALIZADO',
  'EXPIRADO',
  'REVOCADO',
  'SUSPENDIDO',
];

const NIVEL_LABEL = { BAJO: 'Bajo', MEDIO: 'Medio', ALTO: 'Alto' };

const ROLES_MUNICIPALES = ['OPERADOR_MUNICIPAL', 'INSPECTOR_MUNICIPAL'];

// Estados desde los que un permiso todavía puede revocarse (6.2: la
// revocación siempre es una acción humana, nunca automática).
const ESTADOS_REVOCABLES = [
  'PENDIENTE_CONFIRMACION_MUNICIPAL',
  'APROBADO',
  'EN_COLA_ESPERA',
  'ACTIVO',
  'ACTIVO_PENDIENTE_EVIDENCIA',
];

// Estados desde los que un operador municipal puede rechazar una solicitud
// (distinto de revocar: rechazar es "nunca se aprobó", revocar es "se aprobó
// y después se retira el permiso").
const ESTADOS_RECHAZABLES = ['PENDIENTE_CONFIRMACION_MUNICIPAL', 'EN_COLA_ESPERA'];

// Estados desde los que el chofer puede finalizar manualmente su servicio.
const ESTADOS_FINALIZABLES = ['ACTIVO', 'ACTIVO_PENDIENTE_EVIDENCIA'];

// La app móvil envía el polígono sin repetir el primer punto al final
// (lo cierra el propio Backend, ver app-movil/src/services/permisoService.js).
function cerrarAnillo(coords) {
  const anillo = coords.map(([lng, lat]) => [lng, lat]);
  const [primerLng, primerLat] = anillo[0];
  const [ultimoLng, ultimoLat] = anillo[anillo.length - 1];

  if (primerLng !== ultimoLng || primerLat !== ultimoLat) {
    anillo.push([primerLng, primerLat]);
  }

  return anillo;
}

function anilloToWKT(anillo) {
  const puntos = anillo.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
  return `POLYGON((${puntos}))`;
}

// Advertencias (NO bloquean la solicitud): personal con contrato o EPP que no
// cubre la ventana del servicio.
function armarAdvertencias(personas) {
  const advertencias = [];
  for (const p of personas) {
    if (!p.contrato_vigente) advertencias.push({ tipo: 'CONTRATO_VENCIDO', rut: p.rut, nombre: p.nombre ?? null });
    if (!p.epp_al_dia) advertencias.push({ tipo: 'EPP_VENCIDO', rut: p.rut, nombre: p.nombre ?? null });
  }
  return advertencias;
}

function idsUnicos(...grupos) {
  return [...new Set(grupos.flat().filter(Boolean))];
}

async function crear(req, res) {
  const {
    rut_ejecutor,
    comuna_id,
    tipo_actividad,
    area,
    ventana_inicio,
    ventana_fin,
    empresa_ejecutora_id,
    nombre_empresa_ejecutora,
    altura_estimada_m,
    vehiculo_id,
    vehiculos_ids,
    trabajadores_ids,
    personal,
  } = req.body;

  if (!rut_ejecutor || !comuna_id || !tipo_actividad || !area || !ventana_inicio || !ventana_fin) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  if (!Array.isArray(area) || area.length < 3) {
    return res.status(400).json({ error: 'area debe ser un polígono con al menos 3 puntos' });
  }

  const inicio = fechaIso(ventana_inicio);
  const fin = fechaIso(ventana_fin);
  if (!inicio || !fin) {
    return res.status(400).json({ error: 'ventana_inicio y ventana_fin deben ser fechas ISO válidas' });
  }
  if (fin <= inicio) {
    return res.status(400).json({ error: 'ventana_fin debe ser posterior a ventana_inicio' });
  }

  const listasDeIds = { vehiculos_ids, trabajadores_ids };
  const idsInvalidos = [comuna_id, vehiculo_id, ...(vehiculos_ids ?? []), ...(trabajadores_ids ?? [])].filter(
    (id) => id !== undefined && id !== null && !esUuid(id)
  );
  const noSonListas = Object.values(listasDeIds).some((v) => v !== undefined && !Array.isArray(v));
  if (idsInvalidos.length > 0 || noSonListas) {
    return res.status(400).json({ error: 'Alguno de los identificadores enviados no es válido' });
  }

  const anillo = cerrarAnillo(area);
  const wkt = anilloToWKT(anillo);
  const empresaId = req.usuario.empresa_id || null;

  const idsVehiculos = idsUnicos([vehiculo_id], vehiculos_ids ?? []);
  const idsTrabajadores = idsUnicos(trabajadores_ids ?? []);
  const { fecha: finDia } = fechaYHoraSantiago(fin);

  let permiso;
  let advertencias = [];
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Pertenencia: solo vehículos de la empresa del solicitante (o propios).
    if (idsVehiculos.length > 0) {
      const { rows } = await client.query(
        `SELECT id FROM vehiculo
         WHERE id = ANY($1::uuid[]) AND activo = true AND (empresa_id = $2 OR usuario_id = $3)`,
        [idsVehiculos, empresaId, req.usuario.sub]
      );
      if (rows.length !== idsVehiculos.length) {
        throw errorHttp(403, 'Alguno de los vehículos no pertenece a tu empresa o está dado de baja');
      }
    }
    if (idsTrabajadores.length > 0 && !empresaId) {
      throw errorHttp(403, 'Solo una cuenta de empresa puede seleccionar trabajadores de la nómina');
    }

    const { rows } = await client.query(
      `SELECT * FROM fn_crear_permiso(
         $1, $2, $3, $4,
         ST_GeomFromText($5, 4326),
         $6, $7, $8, $9, $10
       )`,
      [
        req.usuario.sub,
        rut_ejecutor,
        comuna_id,
        tipo_actividad,
        wkt,
        ventana_inicio,
        ventana_fin,
        empresa_ejecutora_id || null,
        nombre_empresa_ejecutora || null,
        altura_estimada_m || null,
      ]
    );
    permiso = rows[0];

    // Vehículo principal (base de la validación patente-vs-permiso en terreno).
    if (vehiculo_id) {
      const { rows: vehiculoRows } = await client.query(
        `UPDATE permiso SET vehiculo_id = $1 WHERE id = $2 RETURNING *`,
        [vehiculo_id, permiso.id]
      );
      permiso = vehiculoRows[0];
    }

    // Maquinaria/vehículos adicionales.
    if (Array.isArray(vehiculos_ids) && vehiculos_ids.length > 0) {
      await client.query(
        `INSERT INTO permiso_vehiculo (permiso_id, vehiculo_id)
         SELECT $1, UNNEST($2::uuid[])
         ON CONFLICT DO NOTHING`,
        [permiso.id, vehiculos_ids]
      );
    }

    // Personal declarado en línea (compatibilidad).
    if (Array.isArray(personal)) {
      for (const persona of personal) {
        if (!persona?.rut) continue;
        const contrato = Boolean(persona.contrato_vigente);
        const epp = Boolean(persona.epp_al_dia);
        await client.query(
          `INSERT INTO personal_faena (permiso_id, rut, nombre, cargo, contrato_vigente, epp_al_dia)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [permiso.id, persona.rut, persona.nombre || null, persona.cargo || null, contrato, epp]
        );
        advertencias.push(...armarAdvertencias([{ rut: persona.rut, nombre: persona.nombre, contrato_vigente: contrato, epp_al_dia: epp }]));
      }
    }

    // Trabajadores de la nómina: se copian como "foto del momento" para que
    // el historial no cambie si luego editan al trabajador.
    if (idsTrabajadores.length > 0) {
      const { rows: copiados } = await client.query(
        `INSERT INTO personal_faena
           (permiso_id, trabajador_id, rut, nombre, cargo, contrato_vigente, epp_al_dia,
            contrato_vigente_hasta, epp_vigente_hasta)
         SELECT $1, t.id, t.rut, t.nombre, t.cargo,
                (t.contrato_vigente_hasta IS NOT NULL AND t.contrato_vigente_hasta >= $3::date),
                (t.epp_vigente_hasta IS NOT NULL AND t.epp_vigente_hasta >= $3::date),
                t.contrato_vigente_hasta, t.epp_vigente_hasta
         FROM trabajador t
         WHERE t.id = ANY($2::uuid[]) AND t.empresa_id = $4 AND t.activo = true
         RETURNING rut, nombre, contrato_vigente, epp_al_dia`,
        [permiso.id, idsTrabajadores, finDia, empresaId]
      );
      if (copiados.length !== idsTrabajadores.length) {
        throw errorHttp(403, 'Alguno de los trabajadores no pertenece a tu nómina o está dado de baja');
      }
      advertencias.push(...armarAdvertencias(copiados));
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // Integración con el Microservicio de Riesgo (Módulo 3). Va FUERA de la
  // transacción: si no responde, el permiso queda creado igual, marcado con
  // riesgo pendiente (se reintenta con PATCH /permisos/:id/reevaluar-riesgo).
  let riesgo = null;
  let estadoFinal = permiso.estado;
  try {
    const evaluacion = await evaluarYRegistrar({
      permisoId: permiso.id,
      estado: permiso.estado,
      poligono: { type: 'Polygon', coordinates: [anillo] },
      ventana_inicio,
      tipo_actividad,
    });
    riesgo = evaluacion.riesgo;
    estadoFinal = evaluacion.estado;
  } catch (err) {
    console.error(`No se pudo evaluar el riesgo del permiso ${permiso.id}:`, err.message);
    await marcarRiesgoPendiente(permiso.id);
  }

  const permisoFinal = { ...permiso, estado: estadoFinal, riesgo, riesgo_pendiente: riesgo === null, advertencias };
  emitirEventoSolicitud(req, 'solicitud:nueva', permisoFinal);

  res.status(201).json(permisoFinal);
}

// GET /api/permisos — listado LIVIANO (sin foto de evidencia: esa va en el
// detalle, GET /api/permisos/:id) para no inflar la respuesta de listas largas.
async function listar(req, res) {
  const { rol, comuna_id, sub } = req.usuario;
  const esMunicipal = ROLES_MUNICIPALES.includes(rol);

  const { rows } = await pool.query(
    `SELECT
       p.id, p.usuario_id, p.rut_ejecutor, p.empresa_ejecutora_id, p.nombre_empresa_ejecutora,
       p.comuna_id, p.tipo_actividad, p.altura_estimada_m, p.estado, p.motivo_cola,
       p.ventana_inicio, p.ventana_fin, p.geofencing_confirmado_at, p.riesgo_pendiente,
       p.created_at, p.updated_at,
       ST_AsGeoJSON(p.area)::json AS area,
       v.patente AS patente, v.patente AS vehiculo_patente,
       er.nivel AS nivel_riesgo, er.score AS score_riesgo
     FROM permiso p
     LEFT JOIN vehiculo v ON v.id = p.vehiculo_id
     LEFT JOIN LATERAL (
       SELECT nivel, score FROM evaluacion_riesgo e
       WHERE e.permiso_id = p.id ORDER BY evaluado_at DESC LIMIT 1
     ) er ON true
     WHERE ${esMunicipal ? 'p.comuna_id = $1' : 'p.usuario_id = $1'}
     ORDER BY p.created_at DESC`,
    [esMunicipal ? comuna_id : sub]
  );

  const permisos = rows.map(({ nivel_riesgo, ...permiso }) => ({
    ...permiso,
    riesgo: NIVEL_LABEL[nivel_riesgo] ?? null,
  }));

  res.json(permisos);
}


// GET /api/permisos/:id — detalle completo: foto de evidencia, vehículo
// principal + maquinaria/vehículos adicionales, personal en faena, riesgo
// con score, y línea de tiempo (bitácora: creada, aprobada, iniciada,
// pánico, finalizada — quién y cuándo).
async function detalle(req, res) {
  const { rows } = await pool.query(
    `SELECT
       p.*, ST_AsGeoJSON(p.area)::json AS area,
       er.nivel AS nivel_riesgo, er.score AS score_riesgo, er.detalle AS detalle_riesgo,
       v.patente AS vehiculo_patente, v.alto_m AS vehiculo_alto_m, v.ancho_m AS vehiculo_ancho_m,
       v.largo_m AS vehiculo_largo_m, v.peso_ton AS vehiculo_peso_ton
     FROM permiso p
     LEFT JOIN LATERAL (
       SELECT nivel, score, detalle FROM evaluacion_riesgo e
       WHERE e.permiso_id = p.id ORDER BY evaluado_at DESC LIMIT 1
     ) er ON true
     LEFT JOIN vehiculo v ON v.id = p.vehiculo_id
     WHERE p.id = $1`,
    [req.params.id]
  );

  const permiso = rows[0];

  if (!permiso) {
    return res.status(404).json({ error: 'Permiso no encontrado' });
  }

  const esMunicipal = ROLES_MUNICIPALES.includes(req.usuario.rol);
  const esDueno = permiso.usuario_id === req.usuario.sub;
  const esCodigoChofer = req.usuario.rol === 'CODIGO_CHOFER' && req.usuario.permisoId === permiso.id;
  if (!esDueno && !esCodigoChofer && !(esMunicipal && permiso.comuna_id === req.usuario.comuna_id)) {
    return res.status(403).json({ error: 'Sin acceso a este permiso' });
  }

  const [{ rows: personal }, { rows: vehiculosAdicionales }, lineaTiempo] = await Promise.all([
    pool.query(
      `SELECT id, rut, nombre, cargo, contrato_vigente, epp_al_dia, trabajador_id,
              to_char(contrato_vigente_hasta, 'YYYY-MM-DD') AS contrato_vigente_hasta,
              to_char(epp_vigente_hasta, 'YYYY-MM-DD') AS epp_vigente_hasta
       FROM personal_faena WHERE permiso_id = $1`,
      [permiso.id]
    ),
    pool.query(
      `SELECT v.id, v.patente, v.alto_m, v.ancho_m, v.largo_m, v.peso_ton
       FROM permiso_vehiculo pv JOIN vehiculo v ON v.id = pv.vehiculo_id
       WHERE pv.permiso_id = $1`,
      [permiso.id]
    ),
    bitacoraService.listarPorPermiso(permiso.id),
  ]);

  const {
    nivel_riesgo,
    score_riesgo,
    detalle_riesgo,
    vehiculo_patente,
    vehiculo_alto_m,
    vehiculo_ancho_m,
    vehiculo_largo_m,
    vehiculo_peso_ton,
    ...permisoBase
  } = permiso;

  res.json({
    ...permisoBase,
    riesgo: nivel_riesgo
      ? {
          nivel: NIVEL_LABEL[nivel_riesgo] ?? nivel_riesgo,
          score: score_riesgo,
          explicacion: detalle_riesgo?.explicacion?.resumen ?? null,
          comuna_detectada: detalle_riesgo?.comuna_detectada ?? null,
          fuente_congestion: detalle_riesgo?.fuente_congestion ?? null,
          calles_afectadas: detalle_riesgo?.calles_afectadas ?? [],
        }
      : null,
    vehiculo: vehiculo_patente
      ? { patente: vehiculo_patente, alto_m: vehiculo_alto_m, ancho_m: vehiculo_ancho_m, largo_m: vehiculo_largo_m, peso_ton: vehiculo_peso_ton }
      : null,
    vehiculos_adicionales: vehiculosAdicionales,
    personal,
    advertencias: armarAdvertencias(personal),
    linea_tiempo: lineaTiempo,
  });
}

// GET /api/permisos/:id/qr-token — token firmado y con expiración para el QR
// que muestra el chofer (Semana 5: ya no es el id crudo del permiso).
async function generarQrToken(req, res) {
  const { rows } = await pool.query('SELECT usuario_id, ventana_fin FROM permiso WHERE id = $1', [req.params.id]);
  const permiso = rows[0];

  if (!permiso) {
    return res.status(404).json({ error: 'Permiso no encontrado' });
  }

  const esCodigoChofer = req.usuario.rol === 'CODIGO_CHOFER' && req.usuario.permisoId === req.params.id;
  if (!esCodigoChofer && permiso.usuario_id !== req.usuario.sub) {
    return res.status(403).json({ error: 'Sin acceso a este permiso' });
  }

  const segundosHastaFin = Math.max(60, Math.round((new Date(permiso.ventana_fin).getTime() - Date.now()) / 1000));
  const token = firmarTokenQr(req.params.id, Math.min(segundosHastaFin, 60 * 60 * 24));

  res.json({ token });
}

// GET /api/permisos/qr/:token — el Supervisor/Inspector verifica el QR
// escaneado: valida la firma/expiración y devuelve el mismo detalle completo
// que GET /:id (respeta el control de acceso por comuna de ese endpoint).
async function verificarQr(req, res) {
  let payload;
  try {
    payload = verificarToken(req.params.token);
  } catch (err) {
    return res.status(400).json({ error: 'QR inválido o expirado' });
  }

  if (payload.tipo !== 'QR_PERMISO') {
    return res.status(400).json({ error: 'El código no es un QR de permiso de VíaSegura' });
  }

  req.params.id = payload.permisoId;
  return detalle(req, res);
}

// GET /api/permisos/:id/documento — PDF formal de aprobación/rechazo con
// sello municipal simulado y QR de verificación (Semana 5 Bloque 3). Solo
// existe una vez que la municipalidad ya se pronunció (aprobó o rechazó).
async function documento(req, res) {
  const { rows } = await pool.query(
    `SELECT id, usuario_id, comuna_id, rut_ejecutor, nombre_empresa_ejecutora,
            tipo_actividad, ventana_inicio, ventana_fin, estado
     FROM permiso WHERE id = $1`,
    [req.params.id]
  );
  const permiso = rows[0];

  if (!permiso) {
    return res.status(404).json({ error: 'Permiso no encontrado' });
  }

  const esMunicipal = ROLES_MUNICIPALES.includes(req.usuario.rol);
  const esDueno = permiso.usuario_id === req.usuario.sub;
  if (!esDueno && !(esMunicipal && permiso.comuna_id === req.usuario.comuna_id)) {
    return res.status(403).json({ error: 'Sin acceso a este permiso' });
  }

  let tipo;
  if (ESTADOS_RECHAZADO.includes(permiso.estado)) tipo = 'RECHAZO';
  else if (ESTADOS_APROBADO_O_POSTERIOR.includes(permiso.estado)) tipo = 'APROBACION';
  else {
    return res.status(409).json({ error: 'La municipalidad todavía no se pronuncia sobre esta solicitud' });
  }

  let motivo = null;
  if (tipo === 'RECHAZO') {
    const eventos = await bitacoraService.listarPorPermiso(permiso.id);
    const rechazo = [...eventos].reverse().find((e) => e.tipo_evento === 'RECHAZO_PERMISO');
    motivo = rechazo?.detalle?.motivo || null;
  }

  const pdf = await documentoService.generarDocumentoPermiso(permiso, tipo, { motivo });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="permiso-${permiso.id.slice(0, 8)}-${tipo.toLowerCase()}.pdf"`);
  res.send(pdf);
}

// PATCH /api/permisos/:id/aprobar { comentario? } — el comentario queda en la
// línea de tiempo (bitácora) junto con quién aprobó.
async function aprobar(req, res) {
  const comentario =
    typeof req.body?.comentario === 'string' && req.body.comentario.trim() ? req.body.comentario.trim().slice(0, 500) : null;

  const { rows } = await pool.query(
    `UPDATE permiso
     SET estado = 'APROBADO'
     WHERE id = $1 AND comuna_id = $2 AND estado = 'PENDIENTE_CONFIRMACION_MUNICIPAL'
     RETURNING id, estado, comuna_id, usuario_id, empresa_id`,
    [req.params.id, req.usuario.comuna_id]
  );

  if (!rows[0]) {
    return res.status(409).json({ error: 'El permiso no está en estado PENDIENTE_CONFIRMACION_MUNICIPAL' });
  }

  await bitacoraService.registrarEvento({
    permisoId: rows[0].id,
    comunaId: rows[0].comuna_id,
    tipoEvento: 'APROBACION_PERMISO',
    accion: 'ACEPTAR',
    detalle: comentario ? { comentario } : null,
    actorId: req.usuario.sub,
  });

  // Habilita en tiempo real a los encargados del servicio (Semana 5 Bloque 3).
  emitirEventoSolicitud(req, 'solicitud:aprobada', rows[0]);

  res.json({ id: rows[0].id, estado: rows[0].estado });
}

// Acepta tanto al dueño con cuenta como a una sesión de código de chofer
// (ver requireAuthOCodigoChofer) — en ambos casos solo sobre SU propio permiso.
async function activar(req, res) {
  const { foto_evidencia_url } = req.body;

  if (!foto_evidencia_url) {
    return res.status(400).json({ error: 'foto_evidencia_url es obligatoria' });
  }

  const esCodigoChofer = req.usuario.rol === 'CODIGO_CHOFER';
  if (esCodigoChofer && req.usuario.permisoId !== req.params.id) {
    return res.status(403).json({ error: 'Este código no corresponde a este servicio' });
  }

  const { rows } = await pool.query(
    `UPDATE permiso
     SET estado = 'ACTIVO',
         foto_evidencia_url = $1,
         geofencing_confirmado_at = now()
     WHERE id = $2 AND estado = 'APROBADO' AND ($3::uuid IS NULL OR usuario_id = $3)
     RETURNING id, estado, geofencing_confirmado_at, comuna_id`,
    [foto_evidencia_url, req.params.id, esCodigoChofer ? null : req.usuario.sub]
  );

  if (!rows[0]) {
    return res.status(409).json({ error: 'El permiso no está en estado APROBADO' });
  }

  await bitacoraService.registrarEvento({
    permisoId: rows[0].id,
    comunaId: rows[0].comuna_id,
    tipoEvento: 'ACTIVACION_PERMISO',
    actorId: esCodigoChofer ? null : req.usuario.sub,
    detalle: esCodigoChofer ? { via: 'CODIGO_CHOFER' } : null,
  });

  res.json({ id: rows[0].id, estado: rows[0].estado, geofencing_confirmado_at: rows[0].geofencing_confirmado_at });
}

// PATCH /api/permisos/:id/rechazar — un operador municipal rechaza una
// solicitud que TODAVÍA no fue aprobada (distinto de revocar, que es sobre
// un permiso ya vigente). Sirve para que reportería distinga "nunca se
// aprobó" de "se aprobó y después se retiró".
async function rechazar(req, res) {
  const { motivo } = req.body;

  if (!motivo) {
    return res.status(400).json({ error: 'motivo es obligatorio para rechazar una solicitud' });
  }

  const { rows } = await pool.query(
    `UPDATE permiso
     SET estado = 'RECHAZADO'
     WHERE id = $1 AND comuna_id = $2 AND estado = ANY($3::estado_permiso[])
     RETURNING id, estado, comuna_id, usuario_id, empresa_id`,
    [req.params.id, req.usuario.comuna_id, ESTADOS_RECHAZABLES]
  );

  if (!rows[0]) {
    return res.status(409).json({ error: 'El permiso no existe o ya no puede rechazarse' });
  }

  await bitacoraService.registrarEvento({
    permisoId: rows[0].id,
    comunaId: rows[0].comuna_id,
    tipoEvento: 'RECHAZO_PERMISO',
    accion: 'RECHAZAR',
    detalle: { motivo },
    actorId: req.usuario.sub,
  });

  emitirEventoSolicitud(req, 'solicitud:rechazada', { ...rows[0], motivo });

  res.json({ id: rows[0].id, estado: rows[0].estado });
}

// PATCH /api/permisos/:id/finalizar — el chofer cierra manualmente su
// propio servicio antes de que se cumpla la ventana (o justo al terminar).
async function finalizar(req, res) {
  const { rows } = await pool.query(
    `UPDATE permiso
     SET estado = 'FINALIZADO'
     WHERE id = $1 AND usuario_id = $2 AND estado = ANY($3::estado_permiso[])
     RETURNING id, estado, comuna_id`,
    [req.params.id, req.usuario.sub, ESTADOS_FINALIZABLES]
  );

  if (!rows[0]) {
    return res.status(409).json({ error: 'El permiso no existe o no puede finalizarse' });
  }

  await bitacoraService.registrarEvento({
    permisoId: rows[0].id,
    comunaId: rows[0].comuna_id,
    tipoEvento: 'FINALIZACION_PERMISO',
    actorId: req.usuario.sub,
  });

  res.json({ id: rows[0].id, estado: rows[0].estado });
}

// GET /api/permisos/cola — cola de espera de la comuna del operador,
// ordenada por prioridad (v_cola_espera: EMERGENCIA > menor riesgo > FIFO).
async function cola(req, res) {
  const { rows } = await pool.query(
    `SELECT
       v.id, v.usuario_id, v.rut_ejecutor, v.comuna_id, v.tipo_actividad,
       v.estado, v.motivo_cola, v.ventana_inicio, v.ventana_fin,
       v.created_at, v.updated_at, v.ultimo_score,
       ST_AsGeoJSON(v.area)::json AS area
     FROM v_cola_espera v
     WHERE v.comuna_id = $1
     ORDER BY (v.tipo_actividad = 'EMERGENCIA') DESC, v.ultimo_score ASC NULLS LAST, v.created_at ASC`,
    [req.usuario.comuna_id]
  );

  res.json(rows);
}

// PATCH /api/permisos/:id/revocar — siempre acción humana de un operador
// municipal (6.2). Nunca la dispara un job automático.
async function revocar(req, res) {
  const { motivo } = req.body;

  const { rows } = await pool.query(
    `UPDATE permiso
     SET estado = 'REVOCADO', revocado_por = $1, revocado_at = now()
     WHERE id = $2 AND comuna_id = $3 AND estado = ANY($4::estado_permiso[])
     RETURNING id, estado, revocado_por, revocado_at, comuna_id, usuario_id, empresa_id`,
    [req.usuario.sub, req.params.id, req.usuario.comuna_id, ESTADOS_REVOCABLES]
  );

  if (!rows[0]) {
    return res.status(409).json({ error: 'El permiso no existe o ya no puede revocarse' });
  }

  const permiso = rows[0];

  await bitacoraService.registrarEvento({
    permisoId: permiso.id,
    comunaId: req.usuario.comuna_id,
    tipoEvento: 'REVOCACION_PERMISO',
    accion: 'REVOCAR',
    detalle: { motivo: motivo || null },
    actorId: req.usuario.sub,
  });

  emitirEventoSolicitud(req, 'solicitud:revocada', { ...permiso, motivo: motivo || null });

  res.json(permiso);
}

// PATCH /api/permisos/:id/asignar-movil — asigna escolta municipal.
// Si el permiso estaba EN_COLA_ESPERA por RIESGO_ALTO_SIN_MOVIL, el trigger
// fn_promover_desde_cola_por_movil lo saca de la cola automáticamente.
async function asignarMovil(req, res) {
  const { identificador_movil } = req.body;

  if (!identificador_movil) {
    return res.status(400).json({ error: 'identificador_movil es obligatorio' });
  }

  const { rows: permisoRows } = await pool.query(
    `SELECT id, comuna_id, estado FROM permiso WHERE id = $1 AND comuna_id = $2`,
    [req.params.id, req.usuario.comuna_id]
  );

  if (!permisoRows[0]) {
    return res.status(404).json({ error: 'Permiso no encontrado' });
  }

  const { rows } = await pool.query(
    `INSERT INTO movil_asignado (permiso_id, identificador_movil, asignado_por)
     VALUES ($1, $2, $3)
     RETURNING id, permiso_id, identificador_movil, asignado_at`,
    [req.params.id, identificador_movil, req.usuario.sub]
  );

  await bitacoraService.registrarEvento({
    permisoId: req.params.id,
    comunaId: req.usuario.comuna_id,
    tipoEvento: 'ASIGNACION_MOVIL',
    accion: 'ASIGNAR_SEGURIDAD',
    detalle: { identificador_movil },
    actorId: req.usuario.sub,
  });

  const { rows: actualizado } = await pool.query(
    `SELECT id, estado, motivo_cola FROM permiso WHERE id = $1`,
    [req.params.id]
  );

  res.status(201).json({ movil: rows[0], permiso: actualizado[0] });
}

// GET /api/permisos/:id/bitacora — historial append-only del permiso.
async function bitacora(req, res) {
  const { rows: permisoRows } = await pool.query(
    `SELECT id, comuna_id, usuario_id FROM permiso WHERE id = $1`,
    [req.params.id]
  );
  const permiso = permisoRows[0];

  if (!permiso) {
    return res.status(404).json({ error: 'Permiso no encontrado' });
  }

  const esMunicipal = ROLES_MUNICIPALES.includes(req.usuario.rol);
  const esDueno = permiso.usuario_id === req.usuario.sub;
  const mismaComuna = permiso.comuna_id === req.usuario.comuna_id;

  if (!esDueno && !(esMunicipal && mismaComuna)) {
    return res.status(403).json({ error: 'Sin acceso a la bitácora de este permiso' });
  }

  const eventos = await bitacoraService.listarPorPermiso(req.params.id);
  res.json(eventos);
}

// POST /api/permisos/:id/validar-patente — usado por el Inspector/Supervisor
// en terreno para confirmar que el camión escaneado (patente) es el mismo
// que tiene declarado el permiso. Solo compara: no crea infracción sola.
async function validarPatente(req, res) {
  const { patente } = req.body;

  if (!patente) {
    return res.status(400).json({ error: 'patente es obligatoria' });
  }

  const { rows } = await pool.query(
    `SELECT p.id AS permiso_id, p.comuna_id, v.id AS vehiculo_id, v.patente
     FROM permiso p
     LEFT JOIN vehiculo v ON v.id = p.vehiculo_id
     WHERE p.id = $1 AND p.comuna_id = $2`,
    [req.params.id, req.usuario.comuna_id]
  );

  const permiso = rows[0];

  if (!permiso) {
    return res.status(404).json({ error: 'Permiso no encontrado' });
  }

  if (!permiso.vehiculo_id) {
    return res.status(409).json({ error: 'El permiso no tiene un vehículo asociado' });
  }

  const patenteNormalizada = (p) => p.replace(/[\s-]/g, '').toUpperCase();
  const coincide = patenteNormalizada(permiso.patente) === patenteNormalizada(patente);

  await bitacoraService.registrarEvento({
    permisoId: permiso.permiso_id,
    comunaId: req.usuario.comuna_id,
    tipoEvento: 'VALIDACION_PATENTE',
    detalle: { patente_permiso: permiso.patente, patente_escaneada: patente, coincide },
    actorId: req.usuario.sub,
  });

  res.json({ coincide, patente_permiso: permiso.patente, patente_escaneada: patente });
}

function calcularEstadoOperativo(permiso) {
  const ahora = Date.now();
  const inicio = new Date(permiso.geofencing_confirmado_at).getTime();
  const fin = new Date(permiso.ventana_fin).getTime();

  const duracionTotalMin = Math.round((fin - inicio) / 60000);
  const transcurridoMin = Math.round((ahora - inicio) / 60000);
  const restanteMin = Math.round((fin - ahora) / 60000);

  return {
    id: permiso.id,
    comuna_id: permiso.comuna_id,
    estado: permiso.estado,
    inicio: permiso.geofencing_confirmado_at,
    fin_programado: permiso.ventana_fin,
    duracion_total_min: duracionTotalMin,
    transcurrido_min: transcurridoMin,
    restante_min: restanteMin,
    vencido: restanteMin < 0,
  };
}

// GET /api/permisos/:id/operativo — tiempos en vivo de un servicio activo
// (inicio real = geofencing_confirmado_at), para el detalle en el mapa.
async function operativo(req, res) {
  const { rows } = await pool.query(
    `SELECT id, comuna_id, usuario_id, estado, geofencing_confirmado_at, ventana_fin
     FROM permiso WHERE id = $1`,
    [req.params.id]
  );
  const permiso = rows[0];

  if (!permiso) {
    return res.status(404).json({ error: 'Permiso no encontrado' });
  }

  const esMunicipal = ROLES_MUNICIPALES.includes(req.usuario.rol);
  const esDueno = permiso.usuario_id === req.usuario.sub;
  if (!esDueno && !(esMunicipal && permiso.comuna_id === req.usuario.comuna_id)) {
    return res.status(403).json({ error: 'Sin acceso al estado operativo de este permiso' });
  }

  if (!permiso.geofencing_confirmado_at) {
    return res.status(409).json({ error: 'El permiso aún no se ha activado en terreno' });
  }

  res.json(calcularEstadoOperativo(permiso));
}

// GET /api/permisos/operativos — todos los servicios en curso de la comuna
// del operador, con sus tiempos — alimenta la animación del mapa (Módulo 1).
async function operativos(req, res) {
  const { rows } = await pool.query(
    `SELECT id, comuna_id, usuario_id, estado, geofencing_confirmado_at, ventana_fin,
            ST_AsGeoJSON(area)::json AS area
     FROM permiso
     WHERE comuna_id = $1 AND estado IN ('ACTIVO', 'ACTIVO_PENDIENTE_EVIDENCIA')
       AND geofencing_confirmado_at IS NOT NULL`,
    [req.usuario.comuna_id]
  );

  res.json(rows.map(({ area, ...permiso }) => ({ ...calcularEstadoOperativo(permiso), area })));
}

// PATCH /api/permisos/:id/solicitar-revision { motivo, ventana_propuesta?: { inicio, fin } }
// La municipalidad pide a la empresa cambiar el horario (aplazar) o revisar
// sus datos. Solo sobre una solicitud PENDIENTE o ya aprobada pero a futuro.
// Avisa a la empresa en vivo (solicitud:en_revision) y queda en la bitácora.
async function solicitarRevision(req, res) {
  if (!esUuid(req.params.id)) return res.status(400).json({ error: 'id inválido' });

  const { motivo, ventana_propuesta } = req.body || {};
  if (typeof motivo !== 'string' || !motivo.trim() || motivo.length > 500) {
    return res.status(400).json({ error: 'motivo es obligatorio (máximo 500 caracteres)' });
  }

  let propuestaInicio = null;
  let propuestaFin = null;
  if (ventana_propuesta !== undefined && ventana_propuesta !== null) {
    const inicio = fechaIso(ventana_propuesta.inicio);
    const fin = fechaIso(ventana_propuesta.fin);
    if (!inicio || !fin || fin <= inicio) {
      return res.status(400).json({ error: 'ventana_propuesta debe traer inicio y fin ISO, con fin posterior a inicio' });
    }
    propuestaInicio = ventana_propuesta.inicio;
    propuestaFin = ventana_propuesta.fin;
  }

  const { rows } = await pool.query(
    `UPDATE permiso
     SET estado = 'EN_REVISION', revision_motivo = $1,
         revision_ventana_inicio = $2, revision_ventana_fin = $3
     WHERE id = $4 AND comuna_id = $5
       AND (estado = 'PENDIENTE_CONFIRMACION_MUNICIPAL' OR (estado = 'APROBADO' AND ventana_inicio > now()))
     RETURNING id, estado, comuna_id, usuario_id, empresa_id`,
    [motivo.trim(), propuestaInicio, propuestaFin, req.params.id, req.usuario.comuna_id]
  );

  if (!rows[0]) {
    return res.status(409).json({ error: 'La solicitud no existe o no se puede enviar a revisión en su estado actual' });
  }

  const detalle = {
    motivo: motivo.trim(),
    ventana_propuesta: propuestaInicio ? { inicio: propuestaInicio, fin: propuestaFin } : null,
  };

  await bitacoraService.registrarEvento({
    permisoId: rows[0].id,
    comunaId: rows[0].comuna_id,
    tipoEvento: 'SOLICITUD_REVISION',
    detalle,
    actorId: req.usuario.sub,
  });

  emitirEventoSolicitud(req, 'solicitud:en_revision', { ...rows[0], ...detalle });

  res.json({ id: rows[0].id, estado: rows[0].estado, ...detalle });
}

// PATCH /api/permisos/:id/corregir — la empresa corrige una solicitud EN_REVISION
// (cambia la ventana u otros datos editables) y vuelve a quedar PENDIENTE.
// La puede corregir quien la creó o un administrador (LOGISTICA) de su empresa.
async function corregir(req, res) {
  if (!esUuid(req.params.id)) return res.status(400).json({ error: 'id inválido' });

  const { ventana_inicio, ventana_fin, altura_estimada_m, rut_ejecutor, vehiculo_id } = req.body || {};
  const cambios = {};

  if (ventana_inicio !== undefined || ventana_fin !== undefined) {
    const inicio = fechaIso(ventana_inicio);
    const fin = fechaIso(ventana_fin);
    if (!inicio || !fin || fin <= inicio) {
      return res
        .status(400)
        .json({ error: 'ventana_inicio y ventana_fin deben ser fechas ISO válidas, con fin posterior a inicio' });
    }
    cambios.ventana_inicio = ventana_inicio;
    cambios.ventana_fin = ventana_fin;
  }
  if (altura_estimada_m !== undefined) {
    if (typeof altura_estimada_m !== 'number' || !(altura_estimada_m > 0)) {
      return res.status(400).json({ error: 'altura_estimada_m debe ser un número mayor a 0' });
    }
    cambios.altura_estimada_m = altura_estimada_m;
  }
  if (rut_ejecutor !== undefined) {
    if (typeof rut_ejecutor !== 'string' || !rut_ejecutor.trim()) {
      return res.status(400).json({ error: 'rut_ejecutor no es válido' });
    }
    cambios.rut_ejecutor = rut_ejecutor.trim();
  }
  if (vehiculo_id !== undefined) {
    if (!esUuid(vehiculo_id)) return res.status(400).json({ error: 'vehiculo_id no es válido' });
    const { rows } = await pool.query(
      `SELECT id FROM vehiculo WHERE id = $1 AND activo = true AND (empresa_id = $2 OR usuario_id = $3)`,
      [vehiculo_id, req.usuario.empresa_id || null, req.usuario.sub]
    );
    if (!rows[0]) return res.status(403).json({ error: 'El vehículo no pertenece a tu empresa o está dado de baja' });
    cambios.vehiculo_id = vehiculo_id;
  }

  const campos = Object.keys(cambios);
  const sets = campos.map((campo, i) => `${campo} = $${i + 5}`);
  try {
    const { rows } = await pool.query(
      `UPDATE permiso
       SET estado = 'PENDIENTE_CONFIRMACION_MUNICIPAL',
           revision_motivo = NULL, revision_ventana_inicio = NULL, revision_ventana_fin = NULL
           ${sets.length ? ',' + sets.join(', ') : ''}
       WHERE id = $1 AND estado = 'EN_REVISION'
         AND (usuario_id = $2 OR (empresa_id = $3::uuid AND $4::text = 'LOGISTICA'))
       RETURNING id, estado, comuna_id, usuario_id, empresa_id, ventana_inicio, ventana_fin`,
      [req.params.id, req.usuario.sub, req.usuario.empresa_id || null, req.usuario.rol, ...campos.map((c) => cambios[c])]
    );

    if (!rows[0]) {
      return res.status(409).json({ error: 'La solicitud no existe, no es de tu empresa o no está en revisión' });
    }

    await bitacoraService.registrarEvento({
      permisoId: rows[0].id,
      comunaId: rows[0].comuna_id,
      tipoEvento: 'CORRECCION_PERMISO',
      detalle: { campos_modificados: campos },
      actorId: req.usuario.sub,
    });

    emitirEventoSolicitud(req, 'solicitud:corregida', rows[0]);

    res.json({
      id: rows[0].id,
      estado: rows[0].estado,
      ventana_inicio: rows[0].ventana_inicio,
      ventana_fin: rows[0].ventana_fin,
    });
  } catch (err) {
    if (err.code === '23P01') {
      return res.status(409).json({ error: 'El nuevo horario se solapa con otra solicitud en esa zona. Elige otro horario.' });
    }
    throw err;
  }
}

// PATCH /api/permisos/:id/reevaluar-riesgo — reintenta la evaluación cuando el
// microservicio de riesgo estaba caído al crear la solicitud (riesgo_pendiente).
async function reevaluarRiesgo(req, res) {
  if (!esUuid(req.params.id)) return res.status(400).json({ error: 'id inválido' });

  const { rows } = await pool.query(
    `SELECT id, estado, comuna_id, tipo_actividad, ventana_inicio, ST_AsGeoJSON(area)::json AS poligono
     FROM permiso WHERE id = $1 AND comuna_id = $2`,
    [req.params.id, req.usuario.comuna_id]
  );
  const permiso = rows[0];

  if (!permiso) return res.status(404).json({ error: 'Permiso no encontrado' });

  let evaluacion;
  try {
    evaluacion = await evaluarYRegistrar({
      permisoId: permiso.id,
      estado: permiso.estado,
      poligono: permiso.poligono,
      ventana_inicio: permiso.ventana_inicio,
      tipo_actividad: permiso.tipo_actividad,
    });
  } catch (err) {
    console.error(`No se pudo reevaluar el riesgo del permiso ${permiso.id}:`, err.message);
    return res.status(503).json({ error: 'El servicio de riesgo no está disponible. Intenta de nuevo en unos minutos.' });
  }

  await pool.query('UPDATE permiso SET riesgo_pendiente = false WHERE id = $1 AND riesgo_pendiente = true', [permiso.id]);

  await bitacoraService.registrarEvento({
    permisoId: permiso.id,
    comunaId: permiso.comuna_id,
    tipoEvento: 'REEVALUACION_RIESGO',
    detalle: { nivel: evaluacion.riesgo.nivel, score: evaluacion.riesgo.score },
    actorId: req.usuario.sub,
  });

  res.json({ id: permiso.id, estado: evaluacion.estado, riesgo: evaluacion.riesgo, riesgo_pendiente: false });
}

module.exports = {
  crear,
  listar,
  detalle,
  aprobar,
  activar,
  rechazar,
  finalizar,
  cola,
  revocar,
  asignarMovil,
  bitacora,
  validarPatente,
  operativo,
  operativos,
  generarQrToken,
  verificarQr,
  documento,
  solicitarRevision,
  corregir,
  reevaluarRiesgo,
};
