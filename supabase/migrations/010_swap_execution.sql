-- ============================================================
-- 010_swap_execution.sql
-- Implementa la ejecución real del cambio de turno:
--
--  1. Columnas nuevas en asignaciones:
--       cambio_id         → FK a la solicitud que originó el cambio
--       turno_id_original → turno antes del cambio (para revertir)
--
--  2. Tabla deudas_cambio
--       Cuando se cambia un día de servicio por un día no laborable,
--       se genera una deuda: el maquinista que cedió su descanso
--       tiene derecho a uno futuro.
--
--  3. RPC ejecutar_cambio_turno(solicitud_id)
--       Intercambia los turno_id de ambas asignaciones, genera deuda
--       si procede y marca la solicitud como 'completado'.
--
--  4. RPC revertir_cambio_turno(solicitud_id)
--       Restaura los turno_id originales, elimina la deuda asociada
--       y marca la solicitud como 'revertido'.
-- ============================================================

-- ── 1. Columnas en asignaciones ───────────────────────────────────────────────

ALTER TABLE public.asignaciones
  ADD COLUMN IF NOT EXISTS cambio_id         INTEGER
    REFERENCES public.solicitudes_cambio(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS turno_id_original INTEGER
    REFERENCES public.turnos(id)             ON DELETE SET NULL;

-- ── 2. Estado 'revertido' en solicitudes_cambio ───────────────────────────────
-- Añadimos 'revertido' al CHECK de estado. En Postgres no se puede
-- alterar un CHECK inline, hay que dropearlo y recrearlo.

ALTER TABLE public.solicitudes_cambio
  DROP CONSTRAINT IF EXISTS solicitudes_cambio_estado_check;

ALTER TABLE public.solicitudes_cambio
  ADD CONSTRAINT solicitudes_cambio_estado_check
    CHECK (estado IN ('pendiente','aceptado','rechazado','cancelado','completado','revertido'));

-- ── 3. Tabla deudas_cambio ─────────────────────────��───────────────────────────

CREATE TABLE IF NOT EXISTS public.deudas_cambio (
  id            SERIAL      PRIMARY KEY,
  acreedor_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  deudor_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  solicitud_id  INTEGER     REFERENCES public.solicitudes_cambio(id) ON DELETE SET NULL,
  fecha_origen  DATE        NOT NULL,   -- fecha del día no laborable cedido
  saldada       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_deudas_updated_at ON public.deudas_cambio;
CREATE TRIGGER trg_deudas_updated_at
  BEFORE UPDATE ON public.deudas_cambio
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS deudas_cambio
ALTER TABLE public.deudas_cambio ENABLE ROW LEVEL SECURITY;

-- Cada maquinista ve solo sus deudas (como acreedor o deudor)
DROP POLICY IF EXISTS "deudas_select"       ON public.deudas_cambio;
DROP POLICY IF EXISTS "deudas_select_admin" ON public.deudas_cambio;

CREATE POLICY "deudas_select" ON public.deudas_cambio
  FOR SELECT TO authenticated
  USING (acreedor_id = auth.uid() OR deudor_id = auth.uid());

-- Admin puede ver todas
CREATE POLICY "deudas_select_admin" ON public.deudas_cambio
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

-- ── 4. RPC ejecutar_cambio_turno ─────────────────────────��─────────────────────

CREATE OR REPLACE FUNCTION public.ejecutar_cambio_turno(p_solicitud_id INTEGER)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sol          public.solicitudes_cambio%ROWTYPE;
  v_asig_a_id    INTEGER;
  v_asig_b_id    INTEGER;
  v_turno_a      INTEGER;
  v_turno_b      INTEGER;
  v_tipo_a       TEXT;
  v_tipo_b       TEXT;
  v_es_deuda     BOOLEAN := FALSE;
  v_acreedor_id  UUID;
  v_deudor_id    UUID;
  v_fecha_deuda  DATE;
BEGIN
  -- ── Cargar solicitud ──────────────────���─────────────────────
  SELECT * INTO v_sol FROM public.solicitudes_cambio WHERE id = p_solicitud_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud % no encontrada', p_solicitud_id;
  END IF;

  -- Solo los implicados pueden ejecutar
  IF auth.uid() NOT IN (v_sol.solicitante_id, v_sol.receptor_id) THEN
    RAISE EXCEPTION 'No autorizado para ejecutar este cambio';
  END IF;

  IF v_sol.estado != 'aceptado' THEN
    RAISE EXCEPTION 'La solicitud debe estar en estado aceptado (actual: %)', v_sol.estado;
  END IF;

  -- ── Asignación A (solicitante) ─────────────────────��────────
  SELECT id, turno_id INTO v_asig_a_id, v_turno_a
  FROM public.asignaciones
  WHERE maquinista_id = v_sol.solicitante_id AND fecha = v_sol.fecha_solicitante;

  IF NOT FOUND THEN
    -- Crear asignación vacía si no existe
    INSERT INTO public.asignaciones (maquinista_id, fecha)
    VALUES (v_sol.solicitante_id, v_sol.fecha_solicitante)
    RETURNING id INTO v_asig_a_id;
    v_turno_a := NULL;
  END IF;

  -- ── Asignación B (receptor) ─────────────────────────────────
  SELECT id, turno_id INTO v_asig_b_id, v_turno_b
  FROM public.asignaciones
  WHERE maquinista_id = v_sol.receptor_id AND fecha = v_sol.fecha_receptor;

  IF NOT FOUND THEN
    INSERT INTO public.asignaciones (maquinista_id, fecha)
    VALUES (v_sol.receptor_id, v_sol.fecha_receptor)
    RETURNING id INTO v_asig_b_id;
    v_turno_b := NULL;
  END IF;

  -- ── Detectar deuda (servicio ↔ no-servicio) ─────────────────
  SELECT tipo INTO v_tipo_a FROM public.turnos WHERE id = v_turno_a;
  SELECT tipo INTO v_tipo_b FROM public.turnos WHERE id = v_turno_b;

  -- deuda: uno es servicio, el otro no laborable
  IF (v_tipo_a = 'servicio') <> (v_tipo_b = 'servicio') THEN
    v_es_deuda := TRUE;
    -- Acreedor = quien cede su descanso (queda con servicio)
    -- Deudor   = quien recibe el descanso (queda sin trabajar)
    IF v_tipo_a != 'servicio' THEN
      -- A tenía descanso, ahora trabaja → A es acreedor, B es deudor
      v_acreedor_id := v_sol.solicitante_id;
      v_deudor_id   := v_sol.receptor_id;
      v_fecha_deuda := v_sol.fecha_solicitante;
    ELSE
      -- B tenía descanso, ahora trabaja → B es acreedor, A es deudor
      v_acreedor_id := v_sol.receptor_id;
      v_deudor_id   := v_sol.solicitante_id;
      v_fecha_deuda := v_sol.fecha_receptor;
    END IF;
  END IF;

  -- ── Ejecutar el intercambio ───────────────────────���─────────
  UPDATE public.asignaciones
  SET turno_id          = v_turno_b,
      turno_id_original = v_turno_a,
      cambio_id         = p_solicitud_id,
      updated_at        = NOW()
  WHERE id = v_asig_a_id;

  UPDATE public.asignaciones
  SET turno_id          = v_turno_a,
      turno_id_original = v_turno_b,
      cambio_id         = p_solicitud_id,
      updated_at        = NOW()
  WHERE id = v_asig_b_id;

  -- ── Crear deuda si procede ───────────────────────���──────────
  IF v_es_deuda THEN
    INSERT INTO public.deudas_cambio
      (acreedor_id, deudor_id, solicitud_id, fecha_origen)
    VALUES
      (v_acreedor_id, v_deudor_id, p_solicitud_id, v_fecha_deuda);
  END IF;

  -- ── Marcar solicitud como completado ────────────────────────
  UPDATE public.solicitudes_cambio
  SET estado = 'completado', updated_at = NOW()
  WHERE id = p_solicitud_id;

  RETURN json_build_object(
    'ok',           TRUE,
    'solicitud_id', p_solicitud_id,
    'deuda',        v_es_deuda
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ejecutar_cambio_turno FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ejecutar_cambio_turno TO authenticated;

-- ── 5. RPC revertir_cambio_turno ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revertir_cambio_turno(p_solicitud_id INTEGER)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sol public.solicitudes_cambio%ROWTYPE;
BEGIN
  SELECT * INTO v_sol FROM public.solicitudes_cambio WHERE id = p_solicitud_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud % no encontrada', p_solicitud_id;
  END IF;

  -- Solo implicados o admin pueden revertir
  IF auth.uid() NOT IN (v_sol.solicitante_id, v_sol.receptor_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','superadmin')
    ) THEN
      RAISE EXCEPTION 'No autorizado para revertir este cambio';
    END IF;
  END IF;

  IF v_sol.estado != 'completado' THEN
    RAISE EXCEPTION 'Solo se puede revertir un cambio completado (actual: %)', v_sol.estado;
  END IF;

  -- ── Restaurar asignaciones ────────────────��─────────────────
  UPDATE public.asignaciones
  SET turno_id          = turno_id_original,
      turno_id_original = NULL,
      cambio_id         = NULL,
      updated_at        = NOW()
  WHERE cambio_id = p_solicitud_id;

  -- ── Eliminar deuda asociada (si se saldó o se deshace) ──────
  DELETE FROM public.deudas_cambio
  WHERE solicitud_id = p_solicitud_id AND saldada = FALSE;

  -- ── Marcar solicitud como revertido ─────────────────────────
  UPDATE public.solicitudes_cambio
  SET estado = 'revertido', updated_at = NOW()
  WHERE id = p_solicitud_id;

  RETURN json_build_object('ok', TRUE, 'solicitud_id', p_solicitud_id);
END;
$$;

REVOKE ALL ON FUNCTION public.revertir_cambio_turno FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revertir_cambio_turno TO authenticated;
