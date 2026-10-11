-- ============================================================
-- VíaSegura — Semana 6: nuevo estado EN_REVISION (aplazar horario).
-- Ejecutar SOLA (sin otras sentencias en la misma transacción) y ANTES de
-- 012: un valor recién agregado a un enum no se puede usar en la misma
-- transacción en que se crea.
-- ============================================================

alter type estado_permiso add value if not exists 'EN_REVISION';
