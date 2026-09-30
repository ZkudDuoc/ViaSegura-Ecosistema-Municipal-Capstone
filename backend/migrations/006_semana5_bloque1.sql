-- ============================================================
-- VíaSegura — Semana 5, Bloque 1: nuevos estados (RECHAZADO, SUSPENDIDO;
-- FINALIZADO y EXPIRADO ya existían), personal en faena y maquinaria del
-- permiso, job de expiración de servicios activos vencidos.
-- Ejecutar DESPUÉS de 001..005. IMPORTANTE: correr esta migración sola
-- (los ALTER TYPE ... ADD VALUE no pueden usarse en la misma transacción
-- en que se agregan) antes de desplegar el backend que los usa.
-- ============================================================

alter type estado_permiso add value if not exists 'RECHAZADO';
alter type estado_permiso add value if not exists 'SUSPENDIDO';
alter type accion_operador add value if not exists 'RECHAZAR';
alter type accion_operador add value if not exists 'SUSPENDER';
