-- Fix: el trigger notify_solicitud_cambio fallaba cuando receptor_id es NULL
-- (cambios con maquinistas externos), abortando toda la transacción de INSERT.
-- Solución: salir sin hacer nada si no hay receptor registrado.

create or replace function public.notify_solicitud_cambio()
returns trigger as $$
begin
  -- Cambio externo: no hay receptor en la app, no se notifica
  if new.receptor_id is null then
    return new;
  end if;

  insert into public.notificaciones (usuario_id, tipo, titulo, contenido, data_json)
  select
    new.receptor_id,
    'solicitud_cambio',
    'Nueva solicitud de cambio',
    (select nombre || ' ' || apellidos from public.profiles where id = new.solicitante_id)
      || ' quiere cambiar su turno del '
      || to_char(new.fecha_solicitante, 'DD/MM/YYYY')
      || ' por el tuyo del '
      || to_char(new.fecha_receptor, 'DD/MM/YYYY'),
    jsonb_build_object('solicitud_id', new.id, 'solicitante_id', new.solicitante_id);

  return new;
end;
$$ language plpgsql security definer;

-- El mismo guard en el trigger de respuesta por si acaso
create or replace function public.notify_solicitud_respuesta()
returns trigger as $$
begin
  if old.estado = 'pendiente' and new.estado in ('aceptado', 'rechazado') then
    -- Solo notificar si hay receptor registrado
    if new.receptor_id is null then
      return new;
    end if;

    insert into public.notificaciones (usuario_id, tipo, titulo, contenido, data_json)
    select
      new.solicitante_id,
      'respuesta_cambio',
      case when new.estado = 'aceptado' then '✅ Cambio aceptado' else '❌ Cambio rechazado' end,
      (select nombre || ' ' || apellidos from public.profiles where id = new.receptor_id)
        || case when new.estado = 'aceptado' then ' ha aceptado' else ' ha rechazado' end
        || ' tu solicitud de cambio',
      jsonb_build_object('solicitud_id', new.id, 'estado', new.estado);
  end if;
  return new;
end;
$$ language plpgsql security definer;
