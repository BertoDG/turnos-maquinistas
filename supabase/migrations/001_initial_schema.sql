-- =====================================================
-- TurnosMaq - Esquema inicial de base de datos
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- Extensiones necesarias
create extension if not exists "uuid-ossp";

-- =====================================================
-- TABLAS
-- =====================================================

-- Perfiles de usuarios (extiende auth.users de Supabase)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  matricula varchar(20) unique not null,
  nombre varchar(100) not null,
  apellidos varchar(100) not null,
  depot varchar(50),           -- Depósito/base (ej: "GIJON", "LEON", "MADRID")
  role varchar(20) not null default 'maquinista'
    check (role in ('maquinista', 'admin', 'superadmin')),
  activo boolean not null default true,
  avatar_url text,
  telefono varchar(20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Perfiles de maquinistas y administradores';
comment on column public.profiles.matricula is 'Número de matrícula RENFE del maquinista, usado como identificador de login';

-- Catálogo de tipos de turno
create table public.turnos (
  id serial primary key,
  numero varchar(20) not null unique,   -- Ej: "195", "7067", "D", "DD", "JT", "G21"
  tipo varchar(30) not null default 'servicio'
    check (tipo in ('servicio', 'descanso', 'descanso_doble', 'guardia', 'jornada_turno', 'vacaciones', 'especial')),
  descripcion text,
  color_hex varchar(7) not null default '#FFFFFF',       -- Color de fondo en el calendario
  text_color_hex varchar(7) not null default '#111827',  -- Color del texto
  duracion_minutos int,
  km_totales int,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.turnos is 'Catálogo de todos los tipos de turno disponibles';

-- Servicios (trenes) dentro de un turno
create table public.servicios_turno (
  id serial primary key,
  turno_id int not null references public.turnos(id) on delete cascade,
  orden int not null default 0,          -- Orden dentro del turno
  numero_tren varchar(20),               -- Ej: "70424VJ", "70430"
  origen varchar(50) not null,           -- Ej: "LAVIA", "GIJON"
  destino varchar(50) not null,
  hora_salida time not null,
  hora_llegada time not null,
  dia_siguiente boolean not null default false,  -- Llegada al día siguiente
  tipo_segmento varchar(20) not null default 'conduccion'
    check (tipo_segmento in ('conduccion', 'maniobra', 'relevo', 'espera', 'traslado', 'disponibilidad')),
  km int,
  created_at timestamptz not null default now()
);

comment on table public.servicios_turno is 'Servicios de tren (tramos) que componen cada turno';

-- Asignaciones diarias: qué turno tiene cada maquinista cada día
create table public.asignaciones (
  id serial primary key,
  maquinista_id uuid not null references public.profiles(id) on delete cascade,
  fecha date not null,
  turno_id int references public.turnos(id) on delete set null,
  nota text,                             -- Nota manual del admin
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(maquinista_id, fecha)
);

comment on table public.asignaciones is 'Asignación de turno por maquinista y día';

-- Solicitudes de cambio de turno entre maquinistas
create table public.solicitudes_cambio (
  id serial primary key,
  solicitante_id uuid not null references public.profiles(id) on delete cascade,
  receptor_id uuid not null references public.profiles(id) on delete cascade,
  fecha_solicitante date not null,       -- Fecha del turno que ofrece el solicitante
  fecha_receptor date not null,          -- Fecha del turno que quiere obtener
  estado varchar(20) not null default 'pendiente'
    check (estado in ('pendiente', 'aceptado', 'rechazado', 'cancelado', 'completado')),
  mensaje text,                          -- Mensaje del solicitante
  respuesta text,                        -- Respuesta del receptor
  admin_aprobado boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (solicitante_id != receptor_id)
);

comment on table public.solicitudes_cambio is 'Solicitudes de intercambio de turnos entre maquinistas';

-- Registro de PDFs importados
create table public.pdf_uploads (
  id serial primary key,
  filename varchar(200) not null,
  tipo varchar(30) not null
    check (tipo in ('catalogo_turnos', 'asignacion_maquinista')),
  storage_path text not null,
  estado varchar(20) not null default 'pendiente'
    check (estado in ('pendiente', 'procesando', 'completado', 'error')),
  maquinista_matricula varchar(20),      -- Para asignaciones individuales
  periodo_mes int check (periodo_mes between 1 and 12),
  periodo_anio int,
  registros_creados int not null default 0,
  errores_json jsonb,
  log_texto text,
  subido_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.pdf_uploads is 'Historial de PDFs de RENFE importados al sistema';

-- Notificaciones in-app
create table public.notificaciones (
  id serial primary key,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  tipo varchar(50) not null,
  titulo varchar(200) not null,
  contenido text,
  leida boolean not null default false,
  data_json jsonb,                       -- Datos adicionales (ej: id de solicitud)
  created_at timestamptz not null default now()
);

comment on table public.notificaciones is 'Notificaciones in-app para los usuarios';

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

alter table public.profiles enable row level security;
alter table public.turnos enable row level security;
alter table public.servicios_turno enable row level security;
alter table public.asignaciones enable row level security;
alter table public.solicitudes_cambio enable row level security;
alter table public.pdf_uploads enable row level security;
alter table public.notificaciones enable row level security;

-- Helper function: check if current user is admin
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role in ('admin', 'superadmin')
    and activo = true
  );
$$ language sql security definer stable;

-- PROFILES policies
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id and role = (select role from public.profiles where id = auth.uid()));

create policy "profiles_insert_admin"
  on public.profiles for insert
  to authenticated
  with check (public.is_admin());

create policy "profiles_delete_admin"
  on public.profiles for delete
  to authenticated
  using (public.is_admin());

-- TURNOS policies
create policy "turnos_select_authenticated"
  on public.turnos for select
  to authenticated
  using (true);

create policy "turnos_all_admin"
  on public.turnos for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- SERVICIOS TURNO policies
create policy "servicios_select_authenticated"
  on public.servicios_turno for select
  to authenticated
  using (true);

create policy "servicios_all_admin"
  on public.servicios_turno for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ASIGNACIONES policies
create policy "asignaciones_select_authenticated"
  on public.asignaciones for select
  to authenticated
  using (true);

create policy "asignaciones_all_admin"
  on public.asignaciones for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- SOLICITUDES CAMBIO policies
create policy "solicitudes_select_own"
  on public.solicitudes_cambio for select
  to authenticated
  using (
    auth.uid() = solicitante_id
    or auth.uid() = receptor_id
    or public.is_admin()
  );

create policy "solicitudes_insert_own"
  on public.solicitudes_cambio for insert
  to authenticated
  with check (auth.uid() = solicitante_id);

create policy "solicitudes_update_participants"
  on public.solicitudes_cambio for update
  to authenticated
  using (
    auth.uid() = solicitante_id
    or auth.uid() = receptor_id
    or public.is_admin()
  );

-- PDF UPLOADS policies
create policy "pdf_uploads_all_admin"
  on public.pdf_uploads for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- NOTIFICACIONES policies
create policy "notificaciones_select_own"
  on public.notificaciones for select
  to authenticated
  using (auth.uid() = usuario_id or public.is_admin());

create policy "notificaciones_update_own"
  on public.notificaciones for update
  to authenticated
  using (auth.uid() = usuario_id);

create policy "notificaciones_insert_admin"
  on public.notificaciones for insert
  to authenticated
  with check (public.is_admin());

-- =====================================================
-- TRIGGERS
-- =====================================================

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger turnos_updated_at
  before update on public.turnos
  for each row execute function public.handle_updated_at();

create trigger asignaciones_updated_at
  before update on public.asignaciones
  for each row execute function public.handle_updated_at();

create trigger solicitudes_updated_at
  before update on public.solicitudes_cambio
  for each row execute function public.handle_updated_at();

create trigger pdf_uploads_updated_at
  before update on public.pdf_uploads
  for each row execute function public.handle_updated_at();

-- Trigger: notificar cuando se crea una solicitud de cambio
create or replace function public.notify_solicitud_cambio()
returns trigger as $$
begin
  -- Notificación al receptor
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

create trigger on_solicitud_created
  after insert on public.solicitudes_cambio
  for each row execute function public.notify_solicitud_cambio();

-- Trigger: notificar cuando se responde a una solicitud
create or replace function public.notify_solicitud_respuesta()
returns trigger as $$
begin
  if old.estado = 'pendiente' and new.estado in ('aceptado', 'rechazado') then
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

create trigger on_solicitud_updated
  after update on public.solicitudes_cambio
  for each row execute function public.notify_solicitud_respuesta();

-- =====================================================
-- ÍNDICES DE RENDIMIENTO
-- =====================================================

create index idx_asignaciones_maquinista_fecha
  on public.asignaciones(maquinista_id, fecha);

create index idx_asignaciones_fecha
  on public.asignaciones(fecha);

create index idx_servicios_turno_id
  on public.servicios_turno(turno_id, orden);

create index idx_solicitudes_solicitante
  on public.solicitudes_cambio(solicitante_id, estado);

create index idx_solicitudes_receptor
  on public.solicitudes_cambio(receptor_id, estado);

create index idx_notificaciones_usuario_leida
  on public.notificaciones(usuario_id, leida, created_at desc);

create index idx_profiles_matricula
  on public.profiles(matricula);

create index idx_profiles_depot
  on public.profiles(depot) where activo = true;

-- =====================================================
-- STORAGE BUCKET PARA PDFs
-- =====================================================

-- Ejecutar después de crear el bucket en Supabase Dashboard:
-- insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- values ('pdfs-renfe', 'pdfs-renfe', false, 52428800, array['application/pdf']);

-- Policy de storage (ejecutar separadamente):
-- create policy "Admins can upload PDFs"
--   on storage.objects for insert
--   to authenticated
--   with check (bucket_id = 'pdfs-renfe' and public.is_admin());

-- create policy "Admins can read PDFs"
--   on storage.objects for select
--   to authenticated
--   using (bucket_id = 'pdfs-renfe' and public.is_admin());

-- create policy "Admins can delete PDFs"
--   on storage.objects for delete
--   to authenticated
--   using (bucket_id = 'pdfs-renfe' and public.is_admin());

-- =====================================================
-- DATOS SEMILLA (SEED)
-- =====================================================

-- Tipos de turno base
insert into public.turnos (numero, tipo, descripcion, color_hex, text_color_hex, duracion_minutos) values
  ('D',   'descanso',       'Día de descanso',           '#FEF2F2', '#DC2626', null),
  ('DD',  'descanso_doble', 'Doble descanso',             '#F5F3FF', '#7C3AED', null),
  ('JT',  'jornada_turno',  'Jornada de turno',           '#7F1D1D', '#FECACA', null),
  ('VAC', 'vacaciones',     'Vacaciones',                 '#F0FDF4', '#16A34A', null),
  ('G',   'guardia',        'Guardia',                   '#FFF7ED', '#EA580C', null)
on conflict (numero) do nothing;
