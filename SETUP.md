# TurnosMaq — Guía de puesta en marcha

## Requisitos previos

- Node.js 18+ instalado
- Cuenta en [supabase.com](https://supabase.com) (gratuita para empezar)
- Git (recomendado)
- Para mobile: Android Studio (Android) / Mac con Xcode (iOS)

---

## PASO 1 — Instalar dependencias

```bash
# Abre una terminal en esta carpeta y ejecuta:
npm install
```

---

## PASO 2 — Crear el proyecto en Supabase

1. Ve a https://supabase.com/dashboard y crea un proyecto nuevo
2. Elige región Europa West (Frankfurt) para menor latencia
3. Guarda la **contraseña de la base de datos** que te pide (la necesitarás)
4. Espera ~2 minutos a que se aprovisione

---

## PASO 3 — Configurar variables de entorno

1. En tu proyecto Supabase ve a: **Settings → API**
2. Copia la **Project URL** y la **anon public key**
3. En esta carpeta, copia el fichero de ejemplo:

```bash
cp .env.example .env
```

4. Edita el `.env` y rellena con tus valores:

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

---

## PASO 4 — Crear la base de datos

1. En Supabase Dashboard ve a **SQL Editor**
2. Pulsa **New Query**
3. Copia y pega el contenido del fichero `supabase/migrations/001_initial_schema.sql`
4. Pulsa **Run** (o Ctrl+Enter)
5. Verifica que no hay errores en la salida

---

## PASO 5 — Crear el bucket de Storage para PDFs

1. En Supabase Dashboard ve a **Storage**
2. Pulsa **New bucket**
3. Nombre: `pdfs-renfe`
4. Desmarcar "Public bucket" (debe ser privado)
5. Guardar

Luego ve a **Storage → Policies** y crea las políticas para el bucket:

```sql
-- En SQL Editor:
create policy "Admins can upload PDFs"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'pdfs-renfe' and public.is_admin());

create policy "Admins can read PDFs"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'pdfs-renfe' and public.is_admin());

create policy "Admins can delete PDFs"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'pdfs-renfe' and public.is_admin());
```

---

## PASO 6 — Crear el primer usuario administrador

Como las políticas RLS no permiten auto-registro, el primer admin se crea manualmente:

1. En Supabase Dashboard ve a **Authentication → Users**
2. Pulsa **Invite user** (o **Add user**)
3. Email: `TU_MATRICULA@turnosmaq.internal` (ej: `admin001@turnosmaq.internal`)
4. Password: la que quieras
5. Pulsa **Create user** y copia el UUID del usuario creado

6. Ahora en **SQL Editor** ejecuta:

```sql
INSERT INTO public.profiles (id, matricula, nombre, apellidos, depot, role)
VALUES (
  'UUID_DEL_USUARIO_COPIADO',  -- pega aquí el UUID
  'MATRICULA',                  -- ej: 'admin001'
  'Nombre',
  'Apellidos',
  'DEPOSITO',                   -- ej: 'GIJON'
  'admin'
);
```

---

## PASO 7 — Arrancar la app en desarrollo

```bash
npm run dev
```

Abre http://localhost:3000 en el navegador.
Entra con la matrícula y contraseña que configuraste.

---

## PASO 8 — Desplegar la Edge Function de parseo PDF

```bash
# Instala Supabase CLI si no lo tienes:
npm install -g supabase

# Login
supabase login

# Link al proyecto (usa tu project-ref del dashboard)
supabase link --project-ref TU_PROJECT_REF

# Deploy de la función
supabase functions deploy process-pdf
```

---

## PASO 9 — Compilar para Android

```bash
# 1. Hacer build de producción
npm run build

# 2. Sincronizar con Capacitor
npm run cap:sync

# 3. Abrir en Android Studio
npm run cap:android
```

En Android Studio:
- Espera a que indexe el proyecto
- Conecta un dispositivo Android o usa el emulador
- Pulsa el botón Run ▶

Para generar un APK firmado (distribución):
- Build → Generate Signed Bundle/APK → APK
- Crea una keystore nueva y guárdala en lugar seguro
- Firma el APK y lo tienes listo para subir a Google Play

---

## PASO 10 — Compilar para iOS (requiere Mac + Xcode)

```bash
# En un Mac:
npm run build
npm run cap:sync
npm run cap:ios
```

En Xcode:
- Selecciona tu iPhone o simulador
- Configura tu Apple Developer Team en Signing & Capabilities
- Pulsa el botón Run ▶

Para distribución en App Store:
- Product → Archive
- Distribute App → App Store Connect

---

## PASO 11 — Cuentas de desarrollador en las Stores

### Google Play
- Ve a https://play.google.com/console
- Pago único de 25€
- Proceso de verificación: 2-3 días hábiles
- Sube el AAB (Android App Bundle)

### Apple App Store
- Ve a https://developer.apple.com
- Suscripción anual: 99€
- Proceso de verificación de identidad obligatorio
- Revisión de la app: 1-7 días hábiles

**Documentos necesarios para ambas stores:**
- Política de Privacidad (obligatoria)
- Términos y Condiciones (recomendado)
- Descripción en español e inglés
- Screenshots de la app (al menos 3 por dispositivo)
- Icono de la app en resolución 1024x1024px

---

## PASO 12 — Añadir maquinistas en masa

Para añadir muchos maquinistas de una vez, puedes usar el SQL Editor:

```sql
-- Ejemplo: crear usuario en Auth y su perfil
-- REPITE para cada maquinista

-- 1. Crear usuario de auth (esto se hace mejor desde la API o importación)
-- Alternativa: usar la función de admin de Supabase Auth

-- 2. Una vez creado el usuario en auth, añadir su perfil:
INSERT INTO public.profiles (id, matricula, nombre, apellidos, depot, role)
VALUES
  ('uuid-del-usuario-1', '123001', 'Carlos', 'García López', 'GIJON', 'maquinista'),
  ('uuid-del-usuario-2', '123002', 'María', 'Fernández Ruiz', 'GIJON', 'maquinista'),
  -- ... añade más filas
;
```

Para crear usuarios en masa en Supabase Auth, usa la API de Admin:
```javascript
// Script Node.js de ejemplo (ejecutar una sola vez)
const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(URL, SERVICE_ROLE_KEY)

const maquinistas = [
  { matricula: '123001', nombre: 'Carlos', apellidos: 'García López', depot: 'GIJON' },
  // ...
]

for (const m of maquinistas) {
  const email = `${m.matricula}@turnosmaq.internal`
  const { data: user } = await supabase.auth.admin.createUser({
    email,
    password: m.matricula, // contraseña inicial = matrícula (el usuario la cambiará)
    email_confirm: true,
  })
  
  if (user.user) {
    await supabase.from('profiles').insert({
      id: user.user.id,
      matricula: m.matricula,
      nombre: m.nombre,
      apellidos: m.apellidos,
      depot: m.depot,
      role: 'maquinista',
    })
  }
}
```

---

## Estructura del proyecto

```
turnos_maquinistas_renfe/
├── src/
│   ├── contexts/        # AuthContext
│   ├── hooks/           # useCalendar, useNotifications
│   ├── lib/             # supabase client, utils
│   ├── pages/           # Todas las páginas
│   │   ├── admin/       # Panel administrador
│   │   ├── CalendarPage.tsx
│   │   ├── DayDetailPage.tsx
│   │   ├── ColleaguesPage.tsx
│   │   ├── SwapsPage.tsx
│   │   ├── LoginPage.tsx
│   │   └── ...
│   ├── components/      # Componentes reutilizables
│   │   ├── calendar/
│   │   └── layout/
│   └── types/           # Tipos TypeScript
├── supabase/
│   ├── functions/
│   │   └── process-pdf/ # Edge Function para parsear PDFs
│   └── migrations/
│       └── 001_initial_schema.sql
├── public/
├── package.json
├── vite.config.ts
├── capacitor.config.ts
└── .env                 # (crear desde .env.example)
```

---

## Próximas funcionalidades a implementar

- [ ] Push notifications nativas (Capacitor + FCM)
- [ ] Pantalla de gestión de usuarios en admin
- [ ] Exportar calendario a PDF
- [ ] Widget de próximo turno (iOS/Android)
- [ ] Modo offline (PWA + cache local)
- [ ] Dark mode
- [ ] Notificación de próximo turno con recordatorio
