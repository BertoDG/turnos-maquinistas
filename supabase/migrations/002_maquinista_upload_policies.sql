-- =====================================================
-- Migración 002: Políticas para que maquinistas
-- puedan subir sus propios PDFs de asignación
-- =====================================================
-- Ejecutar en Supabase SQL Editor

-- ── ASIGNACIONES ──────────────────────────────────────────────
-- Permitir que un maquinista inserte asignaciones para SÍ MISMO
create policy "asignaciones_insert_own"
  on public.asignaciones for insert
  to authenticated
  with check (auth.uid() = maquinista_id);

-- Permitir que un maquinista actualice sus propias asignaciones
create policy "asignaciones_update_own"
  on public.asignaciones for update
  to authenticated
  using (auth.uid() = maquinista_id)
  with check (auth.uid() = maquinista_id);

-- ── TURNOS ────────────────────────────────────────────────────
-- Permitir que cualquier usuario autenticado inserte NUEVOS turnos
-- (necesario cuando se importan turnos de servicio 4xxx/7xxx que no existen)
-- El ON CONFLICT DO NOTHING los ignorará si ya existen.
create policy "turnos_insert_authenticated"
  on public.turnos for insert
  to authenticated
  with check (true);

-- ── PDF_UPLOADS ────────────────────────────────────────────────
-- Maquinistas pueden crear registros de sus propias subidas
create policy "pdf_uploads_insert_own"
  on public.pdf_uploads for insert
  to authenticated
  with check (auth.uid() = subido_por);

-- Maquinistas pueden ver sus propias subidas (además de los admins)
create policy "pdf_uploads_select_own"
  on public.pdf_uploads for select
  to authenticated
  using (auth.uid() = subido_por or public.is_admin());
