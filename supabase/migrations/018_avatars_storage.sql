-- ============================================================
-- 018_avatars_storage.sql
-- Bucket "avatars" para fotos de perfil de maquinistas.
--
-- PREREQUISITO: Crear el bucket "avatars" en Supabase Dashboard:
--   Storage → New Bucket → Name: avatars → Public: ON
--
-- Estas políticas asumen que el bucket es público (lecturas sin auth).
-- ============================================================

-- ── Políticas de Storage para el bucket "avatars" ────────────

-- Cualquier usuario autenticado puede leer avatares (el bucket es público)
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Solo el propietario puede subir su propio avatar
CREATE POLICY "avatars_owner_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

-- Solo el propietario puede actualizar su propio avatar
CREATE POLICY "avatars_owner_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

-- Solo el propietario puede eliminar su propio avatar
CREATE POLICY "avatars_owner_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = split_part(name, '/', 1)
  );
