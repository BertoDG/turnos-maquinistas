-- ============================================================
-- 022_pdfs_renfe_storage.sql
-- Bucket "pdfs-renfe" para subida temporal de PDFs LH-820.
-- Solo los administradores pueden subir, leer y borrar.
-- ============================================================

-- Crear el bucket si no existe (privado)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pdfs-renfe',
  'pdfs-renfe',
  false,
  10485760,   -- 10 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Eliminar políticas anteriores si existen (idempotente)
DROP POLICY IF EXISTS "pdfs_renfe_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "pdfs_renfe_admin_select" ON storage.objects;
DROP POLICY IF EXISTS "pdfs_renfe_admin_delete" ON storage.objects;

-- Solo admins pueden subir PDFs
CREATE POLICY "pdfs_renfe_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'pdfs-renfe'
    AND public.get_my_role() IN ('admin', 'superadmin')
  );

-- Solo admins pueden leer PDFs
CREATE POLICY "pdfs_renfe_admin_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'pdfs-renfe'
    AND public.get_my_role() IN ('admin', 'superadmin')
  );

-- Solo admins pueden borrar PDFs (necesario para limpiar temporales)
CREATE POLICY "pdfs_renfe_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'pdfs-renfe'
    AND public.get_my_role() IN ('admin', 'superadmin')
  );
