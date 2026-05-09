-- La política SELECT de asignaciones vuelve a ser pública para todos los
-- usuarios autenticados. Esto permite que en el buscador aparezcan los
-- turnos/trenes aunque el maquinista no comparta su calendario; la identidad
-- del maquinista se oculta en la capa de aplicación según turnos_visibles.
-- Los superadministradores siempre ven todo (también gestionado en el frontend).

DROP POLICY IF EXISTS "asignaciones_select_authenticated" ON public.asignaciones;

CREATE POLICY "asignaciones_select_authenticated"
  ON public.asignaciones FOR SELECT
  TO authenticated
  USING (true);
