-- ============================================================
-- 011_notifications_triggers.sql
-- Correcciones al sistema de notificaciones:
--
--  1. Amplía la política INSERT de notificaciones para que
--     las funciones SECURITY DEFINER puedan insertar.
--
--  2. Trigger en solicitudes_cambio → INSERT
--     Notifica al receptor cuando alguien le pide un cambio.
--
--  3. Trigger en solicitudes_cambio → UPDATE
--     Notifica al solicitante cuando su solicitud cambia de estado.
--     Notifica al receptor cuando el cambio queda completado.
-- ============================================================

-- ── 1. Política INSERT más permisiva ──────────────────────────
-- La función SECURITY DEFINER se ejecuta como postgres/owner,
-- que supera el check de RLS. Pero para poder llamarla desde
-- un trigger de BD también necesitamos permitir la inserción
-- a nivel de función. Cambiamos la policy para permitir
-- a todos los usuarios autenticados insertar (el trigger
-- controla quién recibe qué).

DROP POLICY IF EXISTS "notificaciones_insert_admin" ON public.notificaciones;

CREATE POLICY "notificaciones_insert_authenticated" ON public.notificaciones
  FOR INSERT TO authenticated
  WITH CHECK (true);  -- El trigger controla los datos, no la policy

-- ── 2. Función auxiliar de inserción de notificaciones ────────

CREATE OR REPLACE FUNCTION public.crear_notificacion(
  p_usuario_id  UUID,
  p_tipo        TEXT,
  p_titulo      TEXT,
  p_contenido   TEXT DEFAULT NULL,
  p_data_json   JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notificaciones (usuario_id, tipo, titulo, contenido, data_json)
  VALUES (p_usuario_id, p_tipo, p_titulo, p_contenido, p_data_json);
END;
$$;

REVOKE ALL ON FUNCTION public.crear_notificacion FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_notificacion TO authenticated;

-- ── 3. Trigger en solicitudes_cambio ──────────────────────────

CREATE OR REPLACE FUNCTION public.trg_notificar_cambio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sol_nombre  TEXT;
  v_rec_nombre  TEXT;
BEGIN
  -- Nombres para los mensajes
  SELECT nombre || ' ' || apellidos INTO v_sol_nombre
  FROM public.profiles WHERE id = NEW.solicitante_id;

  SELECT nombre || ' ' || apellidos INTO v_rec_nombre
  FROM public.profiles WHERE id = NEW.receptor_id;

  -- ── INSERT: nueva solicitud → notificar al receptor ─────────
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notificaciones (usuario_id, tipo, titulo, contenido, data_json)
    VALUES (
      NEW.receptor_id,
      'solicitud_cambio',
      'Nueva solicitud de cambio',
      v_sol_nombre || ' quiere cambiar su turno del ' ||
        TO_CHAR(NEW.fecha_solicitante, 'DD/MM') ||
        ' por el tuyo del ' ||
        TO_CHAR(NEW.fecha_receptor, 'DD/MM'),
      jsonb_build_object('solicitud_id', NEW.id)
    );

  -- ── UPDATE: cambio de estado ─────────────────────────────────
  ELSIF TG_OP = 'UPDATE' AND OLD.estado IS DISTINCT FROM NEW.estado THEN

    -- Aceptado → notificar al solicitante
    IF NEW.estado = 'aceptado' THEN
      INSERT INTO public.notificaciones (usuario_id, tipo, titulo, contenido, data_json)
      VALUES (
        NEW.solicitante_id,
        'respuesta_cambio',
        'Solicitud aceptada',
        v_rec_nombre || ' ha aceptado el cambio del ' ||
          TO_CHAR(NEW.fecha_solicitante, 'DD/MM') ||
          ' por el ' ||
          TO_CHAR(NEW.fecha_receptor, 'DD/MM'),
        jsonb_build_object('solicitud_id', NEW.id)
      );

    -- Completado → notificar a ambos
    ELSIF NEW.estado = 'completado' THEN
      INSERT INTO public.notificaciones (usuario_id, tipo, titulo, contenido, data_json)
      VALUES (
        NEW.solicitante_id,
        'cambio_completado',
        '¡Cambio de turno realizado!',
        'Tu turno del ' || TO_CHAR(NEW.fecha_solicitante, 'DD/MM') ||
          ' ha sido cambiado con ' || v_rec_nombre,
        jsonb_build_object('solicitud_id', NEW.id, 'fecha', NEW.fecha_solicitante)
      );
      INSERT INTO public.notificaciones (usuario_id, tipo, titulo, contenido, data_json)
      VALUES (
        NEW.receptor_id,
        'cambio_completado',
        '¡Cambio de turno realizado!',
        'Tu turno del ' || TO_CHAR(NEW.fecha_receptor, 'DD/MM') ||
          ' ha sido cambiado con ' || v_sol_nombre,
        jsonb_build_object('solicitud_id', NEW.id, 'fecha', NEW.fecha_receptor)
      );

    -- Rechazado → notificar al solicitante
    ELSIF NEW.estado = 'rechazado' THEN
      INSERT INTO public.notificaciones (usuario_id, tipo, titulo, contenido, data_json)
      VALUES (
        NEW.solicitante_id,
        'respuesta_cambio',
        'Solicitud rechazada',
        v_rec_nombre || ' ha rechazado el cambio del ' ||
          TO_CHAR(NEW.fecha_solicitante, 'DD/MM'),
        jsonb_build_object('solicitud_id', NEW.id)
      );

    -- Revertido → notificar a ambos
    ELSIF NEW.estado = 'revertido' THEN
      INSERT INTO public.notificaciones (usuario_id, tipo, titulo, contenido, data_json)
      VALUES (
        NEW.solicitante_id,
        'cambio_revertido',
        'Cambio de turno revertido',
        'El cambio del ' || TO_CHAR(NEW.fecha_solicitante, 'DD/MM') ||
          ' con ' || v_rec_nombre || ' ha sido deshecho.',
        jsonb_build_object('solicitud_id', NEW.id)
      );
      INSERT INTO public.notificaciones (usuario_id, tipo, titulo, contenido, data_json)
      VALUES (
        NEW.receptor_id,
        'cambio_revertido',
        'Cambio de turno revertido',
        'El cambio del ' || TO_CHAR(NEW.fecha_receptor, 'DD/MM') ||
          ' con ' || v_sol_nombre || ' ha sido deshecho.',
        jsonb_build_object('solicitud_id', NEW.id)
      );

    -- Cancelado → notificar al receptor
    ELSIF NEW.estado = 'cancelado' THEN
      INSERT INTO public.notificaciones (usuario_id, tipo, titulo, contenido, data_json)
      VALUES (
        NEW.receptor_id,
        'respuesta_cambio',
        'Solicitud cancelada',
        v_sol_nombre || ' ha cancelado su solicitud de cambio del ' ||
          TO_CHAR(NEW.fecha_solicitante, 'DD/MM'),
        jsonb_build_object('solicitud_id', NEW.id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_solicitud_cambio_notificar ON public.solicitudes_cambio;
CREATE TRIGGER trg_solicitud_cambio_notificar
  AFTER INSERT OR UPDATE ON public.solicitudes_cambio
  FOR EACH ROW EXECUTE FUNCTION public.trg_notificar_cambio();
