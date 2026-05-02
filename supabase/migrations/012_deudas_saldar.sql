-- ============================================================
-- 012_deudas_saldar.sql
-- Permite a los participantes de una deuda marcarla como saldada.
-- ============================================================

CREATE OR REPLACE FUNCTION public.saldar_deuda(p_deuda_id INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.deudas_cambio
  SET saldada    = TRUE,
      updated_at = NOW()
  WHERE id = p_deuda_id
    AND (acreedor_id = auth.uid() OR deudor_id = auth.uid())
    AND saldada = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deuda % no encontrada, ya saldada, o sin permiso', p_deuda_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.saldar_deuda FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.saldar_deuda TO authenticated;
