// =====================================================
// TurnosMaq — Tipos TypeScript
// =====================================================

export type UserRole = 'maquinista' | 'admin' | 'superadmin'

export type TurnoTipo =
  | 'servicio'
  | 'descanso'
  | 'descanso_doble'
  | 'guardia'
  | 'jornada_turno'
  | 'vacaciones'
  | 'especial'

export type SolicitudEstado =
  | 'pendiente'
  | 'aceptado'
  | 'rechazado'
  | 'cancelado'
  | 'completado'
  | 'revertido'

export type PdfUploadEstado = 'pendiente' | 'procesando' | 'completado' | 'error'

export type PdfUploadTipo = 'catalogo_turnos' | 'asignacion_maquinista' | 'lh_trenes'

export type SegmentoTipo =
  | 'conduccion'
  | 'maniobra'
  | 'relevo'
  | 'espera'
  | 'traslado'
  | 'disponibilidad'

// =====================================================
// ENTIDADES DE BASE DE DATOS
// =====================================================

export interface Profile {
  id: string
  matricula: string
  nombre: string
  apellidos: string
  depot: string | null
  role: UserRole
  activo: boolean
  avatar_url: string | null
  telefono: string | null
  observaciones: string | null
  created_at: string
  updated_at: string
}

export interface Turno {
  id: number
  numero: string
  tipo: TurnoTipo
  descripcion: string | null
  color_hex: string
  text_color_hex: string
  duracion_minutos: number | null
  hora_inicio: string | null   // hora de presentación (inicio de jornada)
  hora_fin: string | null      // hora de finalización (fin de jornada)
  km_totales: number | null
  activo: boolean
  created_at: string
  updated_at: string
}

export interface ServicioTurno {
  id: number
  turno_id: number
  orden: number
  numero_tren: string | null
  origen: string
  destino: string
  hora_salida: string   // "HH:MM:SS"
  hora_llegada: string  // "HH:MM:SS"
  dia_siguiente: boolean
  tipo_segmento: SegmentoTipo
  km: number | null
  created_at: string
}

export interface Incidencia {
  codigo:         string
  descripcion:    string
  tipo:           TurnoTipo
  color_hex:      string
  text_color_hex: string
  activo:         boolean
  created_at:     string
  updated_at:     string
}

export interface Asignacion {
  id: number
  maquinista_id: string
  fecha: string           // "YYYY-MM-DD"
  turno_id: number | null
  turno_id_original: number | null   // turno anterior al cambio
  cambio_id: number | null           // FK a solicitudes_cambio
  nota: string | null
  created_at: string
  updated_at: string
  // Joins
  turno?: Turno
  turno_original?: Turno             // turno antes del cambio
  maquinista?: Profile
}

export interface SolicitudCambio {
  id: number
  solicitante_id: string
  receptor_id: string | null          // null en cambios con maquinistas externos
  receptor_externo: string | null      // nombre/matrícula del maquinista externo
  turno_receptor_id: number | null     // turno elegido en cambios externos
  fecha_solicitante: string
  fecha_receptor: string
  estado: SolicitudEstado
  mensaje: string | null
  respuesta: string | null
  admin_aprobado: boolean | null
  created_at: string
  updated_at: string
  // Joins
  solicitante?: Profile
  receptor?: Profile
  turno_solicitante?: Turno
  turno_receptor?: Turno
}

export interface PdfUpload {
  id: number
  filename: string
  tipo: PdfUploadTipo
  storage_path: string
  estado: PdfUploadEstado
  maquinista_matricula: string | null
  periodo_mes: number | null
  periodo_anio: number | null
  registros_creados: number
  errores_json: unknown | null
  log_texto: string | null
  subido_por: string | null
  created_at: string
  updated_at: string
  // Joins
  subido_por_profile?: Profile
}

export interface DeudaCambio {
  id: number
  acreedor_id: string
  deudor_id: string
  solicitud_id: number | null
  fecha_origen: string      // "YYYY-MM-DD" — día que originó la deuda
  saldada: boolean
  created_at: string
  updated_at: string
  // Joins
  acreedor?: Profile
  deudor?: Profile
}

export interface Notificacion {
  id: number
  usuario_id: string
  tipo: string
  titulo: string
  contenido: string | null
  leida: boolean
  data_json: Record<string, unknown> | null
  created_at: string
}

// =====================================================
// TIPOS DE VISTA / UI
// =====================================================

export interface CalendarDay {
  date: Date
  dateStr: string          // "YYYY-MM-DD"
  dayNumber: number
  isToday: boolean
  isCurrentMonth: boolean
  isWeekend: boolean
  asignacion: Asignacion | null
}

export interface CalendarMonth {
  year: number
  month: number            // 0-indexed (0=enero)
  label: string            // "Abril 2026"
  days: CalendarDay[]
}

export interface TurnoConServicios extends Turno {
  servicios: ServicioTurno[]
}

export interface AsignacionConTurno extends Asignacion {
  turno: TurnoConServicios | null
}

// =====================================================
// COLORES DE TURNOS (sistema de colores)
// =====================================================

export const TURNO_TIPO_COLORS: Record<TurnoTipo, { bg: string; text: string; border: string }> = {
  servicio:       { bg: '#EFF6FF', text: '#1E40AF', border: '#BFDBFE' },
  descanso:       { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
  descanso_doble: { bg: '#F5F3FF', text: '#7C3AED', border: '#DDD6FE' },
  guardia:        { bg: '#FFF7ED', text: '#EA580C', border: '#FED7AA' },
  jornada_turno:  { bg: '#7F1D1D', text: '#FECACA', border: '#991B1B' },
  vacaciones:     { bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0' },
  especial:       { bg: '#F0F9FF', text: '#0369A1', border: '#BAE6FD' },
}

export const DIAS_SEMANA = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']
export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
