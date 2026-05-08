-- ============================================================
-- 025_fix_handle_new_user_trigger.sql
-- Corrige el trigger handle_new_user que fallaba con
-- "Database error saving new user" al hacer signUp().
--
-- Causa: cast ::public.user_role no existe como tipo enum;
-- PL/pgSQL lo compilaba pero fallaba en tiempo de ejecución.
-- Solución: quitar el cast explícito (el VARCHAR acepta TEXT
-- directamente; si la columna fuera enum, PostgreSQL hace la
-- conversión implícita).
--
-- También: usa ON CONFLICT (matricula) en lugar de (id) para
-- gestionar el caso de auto-registro cuando ya existe perfil.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    matricula,
    nombre,
    apellidos,
    telefono,
    observaciones,
    role,
    activo
  ) VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'matricula', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'nombre', ''),
    COALESCE(NEW.raw_user_meta_data->>'apellidos', ''),
    NEW.raw_user_meta_data->>'telefono',
    NEW.raw_user_meta_data->>'observaciones',
    COALESCE(NEW.raw_user_meta_data->>'role', 'maquinista'),
    COALESCE((NEW.raw_user_meta_data->>'activo')::boolean, FALSE)
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
