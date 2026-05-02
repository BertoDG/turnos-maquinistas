# TurnosMaq — Plan de Desarrollo

**Stack**: React + TypeScript + Vite · Capacitor (iOS/Android) · Supabase · shadcn/ui + Tailwind · Edge Functions (Deno)

---

## FASE 1 — Setup del proyecto ✅ PRIMERA
- Scaffold Vite + React + TypeScript
- TailwindCSS + shadcn/ui instalados
- Capacitor inicializado (iOS + Android targets)
- Supabase project creado + .env configurado
- React Router + estructura de carpetas
- ESLint + Prettier

## FASE 2 — Base de datos Supabase ✅ PRIMERA
- Tablas: profiles, turnos, servicios_turno, asignaciones
- Tablas: solicitudes_cambio, pdf_uploads, notificaciones
- Row Level Security (RLS) policies por rol
- Storage bucket para PDFs de RENFE
- Índices y foreign keys
- Seed data: tipos de turno base (D, DD, JT...)

## FASE 3 — Autenticación ✅ PRIMERA
- Login por matrícula + contraseña (Supabase Auth)
- Registro inicial por admin (invitación)
- Context de sesión global en React
- Rutas protegidas (PrivateRoute)
- Rol maquinista vs. admin
- Pantalla de primer acceso (cambio de contraseña)

## FASE 4 — Calendario principal ✅ PRIMERA
- Vista mensual con scroll vertical por meses
- Celdas de día con color según tipo de turno
- Indicador de turno (número + color)
- Navegación fluida entre meses (swipe en mobile)
- Leyenda de colores
- Highlight del día actual

## FASE 5 — Detalle del día ✅ PRIMERA
- Modal/panel deslizante al pulsar un día
- Nombre del turno + duración total + km
- Timeline de servicios: tren, origen→destino, horas
- Indicador visual de tramos (línea vertical tipo timeline)
- Días de descanso con diseño diferenciado
- Compartir / ver en pantalla completa

## FASE 6 — Panel de Administración (2ª etapa)
- Interfaz de carga de PDFs (drag & drop)
- Selección de tipo: catálogo de turnos / asignación individual
- Progreso de procesamiento en tiempo real (Supabase Realtime)
- Historial de importaciones con estado
- Gestión de usuarios (crear, desactivar maquinistas)
- Revisión de datos parseados antes de confirmar

## FASE 7 — Edge Function: Parser PDF (2ª etapa)
- Edge Function Deno: recibe PDF desde Storage
- Parser del catálogo de turnos RENFE (trenes + horarios)
- Parser de asignaciones por maquinista (mes + turno por día)
- Validación y detección de errores en el PDF
- Inserción masiva en BD con upsert
- Logs de errores y notificación al admin

## FASE 8 — Vista de compañeros (2ª etapa)
- Buscador por nombre o matrícula
- Ver calendario de cualquier maquinista (solo lectura)
- Filtros por depósito/base
- Ver qué compañero trabaja un día concreto
- Lista de maquinistas disponibles para cambio

## FASE 9 — Sistema de cambios de turno (3ª etapa)
- Solicitar cambio: elegir fecha propia + fecha del compañero
- Notificación push/in-app al receptor
- Flujo de aceptar / rechazar con mensaje opcional
- Vista "Mis solicitudes" (enviadas y recibidas)
- Validación de compatibilidad de turnos
- Historial de cambios realizados

## FASE 10 — Notificaciones (3ª etapa)
- Notificaciones in-app (campana + badge)
- Push notifications via Capacitor (FCM/APNs)
- Tipos: nueva solicitud, aceptación, rechazo, recordatorio turno
- Centro de notificaciones con leído/no leído
- Preferencias de notificación por usuario

## FASE 11 — Compilación Mobile
- Capacitor sync + build Android (APK/AAB)
- Capacitor sync + build iOS (requiere Mac + Xcode)
- Splash screen + icono app con branding
- Ajustes de UI para pantallas móvil (safe areas, gestos)
- Testing en dispositivos reales
- App firmada para distribución

## FASE 12 — Publicación en Stores
- Cuenta Google Play Developer (25€ única vez)
- Cuenta Apple Developer (99€/año)
- Screenshots, descripción, categoría, privacidad
- Google Play: subir AAB, revisión ~1-3 días
- App Store: subir .ipa, revisión ~1-7 días
- Política de privacidad obligatoria (GDPR/LOPD)

---

## Arquitectura de la Base de Datos

```sql
profiles          → usuarios (matrícula, nombre, depot, rol)
turnos            → catálogo de turnos (número, tipo, color, duración)
servicios_turno   → trenes dentro de un turno (origen, destino, horas)
asignaciones      → turno por maquinista por día
solicitudes_cambio → peticiones de cambio entre maquinistas
pdf_uploads       → registro de PDFs importados
notificaciones    → notificaciones in-app
```

## Notas importantes

- **Supabase**: Plan Free suficiente para desarrollo. Migrar a Pro (~25$/mes) cuando supere los 50.000 filas activas o necesite más de 500MB storage.
- **Capacitor**: La compilación iOS requiere un Mac con Xcode. Android se puede hacer en cualquier SO.
- **Apple Developer**: 99€/año, proceso de verificación de identidad obligatorio.
- **Google Play**: 25€ pago único.
- **GDPR/LOPD**: Al manejar datos de trabajadores hay que redactar una política de privacidad y términos de uso.
