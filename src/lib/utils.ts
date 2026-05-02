import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isToday,
  isSameMonth,
} from 'date-fns'
import { es } from 'date-fns/locale'
import type { CalendarDay, CalendarMonth, Asignacion } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// =====================================================
// UTILIDADES DE FECHAS
// =====================================================

export function formatDate(dateStr: string, formatStr: string = 'dd/MM/yyyy'): string {
  try {
    return format(parseISO(dateStr), formatStr, { locale: es })
  } catch {
    return dateStr
  }
}

export function formatTime(timeStr: string): string {
  // Convierte "HH:MM:SS" a "HH:MM"
  if (!timeStr) return ''
  return timeStr.substring(0, 5)
}

export function formatDuration(minutes: number | null): string {
  if (!minutes) return ''
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}min`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}min`
}

export function toDateString(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function getDayOfWeekMonday(date: Date): number {
  // 0=Lunes, 6=Domingo (JavaScript: 0=Dom, 1=Lun...)
  const day = getDay(date)
  return day === 0 ? 6 : day - 1
}

// =====================================================
// GENERADOR DE CALENDARIO
// =====================================================

export function buildCalendarMonth(
  year: number,
  month: number, // 0-indexed
  asignaciones: Asignacion[]
): CalendarMonth {
  const firstDay = startOfMonth(new Date(year, month))
  const lastDay = endOfMonth(new Date(year, month))
  const allDays = eachDayOfInterval({ start: firstDay, end: lastDay })

  // Mapa rápido de asignaciones por fecha
  const asignacionMap = new Map<string, Asignacion>()
  for (const a of asignaciones) {
    asignacionMap.set(a.fecha, a)
  }

  // Días vacíos antes del primer día del mes (para alinear con Lunes)
  const paddingStart = getDayOfWeekMonday(firstDay)
  const paddingDays: CalendarDay[] = Array(paddingStart).fill(null).map(() => ({
    date: new Date(0),
    dateStr: '',
    dayNumber: 0,
    isToday: false,
    isCurrentMonth: false,
    isWeekend: false,
    asignacion: null,
  }))

  const calDays: CalendarDay[] = allDays.map((date) => {
    const dateStr = toDateString(date)
    const dowMonday = getDayOfWeekMonday(date)
    return {
      date,
      dateStr,
      dayNumber: date.getDate(),
      isToday: isToday(date),
      isCurrentMonth: isSameMonth(date, firstDay),
      isWeekend: dowMonday >= 5, // Sábado o Domingo
      asignacion: asignacionMap.get(dateStr) ?? null,
    }
  })

  return {
    year,
    month,
    label: format(firstDay, 'MMMM yyyy', { locale: es })
      .replace(/^\w/, (c) => c.toUpperCase()),
    days: [...paddingDays, ...calDays],
  }
}

// =====================================================
// UTILIDADES DE TURNOS
// =====================================================

export function getTurnoColor(turno: { color_hex: string; text_color_hex: string } | null | undefined) {
  if (!turno) return { bg: '#F9FAFB', text: '#6B7280', border: '#E5E7EB' }
  return {
    bg: turno.color_hex,
    text: turno.text_color_hex,
    border: turno.color_hex === '#FFFFFF' ? '#E5E7EB' : turno.color_hex,
  }
}

export function isDescanso(tipo: string | undefined): boolean {
  return tipo === 'descanso' || tipo === 'descanso_doble' || tipo === 'vacaciones'
}

// =====================================================
// UTILIDADES DE STRINGS
// =====================================================

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export function getInitials(nombre: string, apellidos: string): string {
  return `${nombre.charAt(0)}${apellidos.charAt(0)}`.toUpperCase()
}
