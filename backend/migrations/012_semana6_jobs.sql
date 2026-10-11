-- ============================================================
-- VíaSegura — Semana 6: expiración de solicitudes que nunca se resolvieron.
-- Ejecutar DESPUÉS de 011 (usa EN_REVISION).
-- ============================================================

-- Una solicitud PENDIENTE, en cola o en revisión cuya ventana ya terminó no
-- tiene sentido seguirla mostrando en la bandeja: pasa a EXPIRADO (el trigger
-- de bitácora registra el cambio).
create or replace function fn_expirar_solicitudes_sin_resolver()
returns void as $$
begin
  update permiso
  set estado = 'EXPIRADO'
  where estado in ('PENDIENTE_CONFIRMACION_MUNICIPAL', 'EN_COLA_ESPERA', 'EN_REVISION')
    and ventana_fin < now();
end;
$$ language plpgsql;

select cron.schedule(
  'expirar-solicitudes-sin-resolver',
  '* * * * *',
  $$select fn_expirar_solicitudes_sin_resolver();$$
);
