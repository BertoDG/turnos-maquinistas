-- ============================================================
-- 030_get_email_by_matricula.sql
-- Función pública para resolver el email de autenticación
-- a partir de la matrícula del maquinista.
--
-- Necesaria para permitir login con matrícula en usuarios
-- auto-registrados, cuyo email en auth.users es su correo
-- real (no el dominio @turnosmaq.app).
--
-- Accesible por rol `anon` (usuarios no autenticados en el
-- formulario de login).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_email_by_matricula(p_matricula TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT u.email INTO v_email
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.matricula = lower(trim(p_matricula));

  RETURN v_email; -- NULL si la matrícula no existe
END;
$$;

REVOKE ALL ON FUNCTION public.get_email_by_matricula FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_email_by_matricula TO anon, authenticated;
