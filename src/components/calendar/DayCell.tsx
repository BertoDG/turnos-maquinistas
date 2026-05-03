import { cn } from '@/lib/utils'
import { computeTurnoColors } from '@/lib/turnoColors'
import { useColorPrefs } from '@/contexts/ColorPrefsContext'
import type { CalendarDay } from '@/types'
import { ArrowLeftRight } from 'lucide-react'

// ── Tamaños de texto responsivos ─────────────────────────────────────────────
// Las celdas ocupan 1/7 del ancho disponible. Usamos clamp() con unidades vw
// para que el texto escale con el tamaño real de la celda.

function dayNumFontSize(): string {
  return 'clamp(8px, 2.2vw, 15px)'
}

function turnoCodeFontSize(len: number): string {
  if (len <= 2) return 'clamp(14px, 5vw, 30px)'    // D, DD, VB
  if (len <= 4) return 'clamp(11px, 3.8vw, 22px)'  // 4829, 7067
  return              'clamp(9px,  2.8vw, 16px)'   // RMTC, etc.
}

function timeFontSize(): string {
  return 'clamp(7px, 1.8vw, 11px)'
}

// ── Número de día con cuadro fusionado a la esquina ──────────────────────────
// Se posiciona absolute top-0 left-0 para que comparta exactamente
// la curva top-left de la celda (rounded-tl-xl). La esquina interior
// lleva rounded-br-xl para crear el corte diagonal.

function DayNumber({ dayNumber, isToday, isWeekend }: {
  dayNumber: number
  isToday:   boolean
  isWeekend: boolean
}) {
  return (
    <div
      style={{ fontSize: dayNumFontSize() }}
      className={cn(
        'absolute top-0 left-0',
        'flex items-center justify-center',
        'w-[1.7em] h-[1.7em] font-bold leading-none',
        'rounded-tl-xl rounded-br-xl',
        isToday
          ? 'bg-red-500 text-white'
          : isWeekend
            ? 'bg-white/80 text-red-500'
            : 'bg-white/80 text-gray-800',
      )}
    >
      {dayNumber}
    </div>
  )
}

// ── Componente ────────────────────────────────────────────────────────────────

interface DayCellProps {
  day: CalendarDay
  showTimes?: boolean
  onClick?: (day: CalendarDay) => void
}

export default function DayCell({ day, showTimes = true, onClick }: DayCellProps) {
  const { prefs } = useColorPrefs()

  if (!day.isCurrentMonth || day.dayNumber === 0) {
    return <div className="aspect-square" />
  }

  const turno     = day.asignacion?.turno
  const isWeekend = day.isWeekend

  // ── Sin turno asignado ────────────────────────────────────────────
  if (!turno) {
    return (
      <button
        data-date={day.dateStr}
        onClick={() => onClick?.(day)}
        className={cn(
          'relative aspect-square rounded-xl flex flex-col p-1.5',
          'bg-white border border-gray-100',
          day.isToday && 'ring-2 ring-red-500 ring-offset-1',
        )}
      >
        <DayNumber dayNumber={day.dayNumber} isToday={day.isToday} isWeekend={isWeekend} />
      </button>
    )
  }

  const isDescanso   = turno.tipo === 'descanso' || turno.tipo === 'descanso_doble'
  const isVacaciones = turno.tipo === 'vacaciones'
  const isCambio     = !!day.asignacion?.cambio_id

  // Días cambiados usan el color del slot 'cambio' del perfil
  const baseColors   = computeTurnoColors(turno, prefs)
  const cambioColors = prefs.cambio
  const bg     = isCambio ? cambioColors.bg     : baseColors.bg
  const border = isCambio ? cambioColors.border : baseColors.border
  const turnoText = isCambio ? cambioColors.text : baseColors.turnoText

  // Horas formateadas (HH:MM)
  // Para guardias virtuales 7xxx/8xxx: decodificar del código si no están en BD
  let horaInicio = turno.hora_inicio ? turno.hora_inicio.slice(0, 5) : null
  let horaFin    = turno.hora_fin    ? turno.hora_fin.slice(0, 5)    : null

  // Fallback hora_fin desde el último servicio (igual que DayDetailPage)
  if (!horaFin) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const servicios: Array<{ orden: number; hora_llegada: string }> = (turno as any).servicios ?? []
    if (servicios.length > 0) {
      const last = [...servicios].sort((a, b) => a.orden - b.orden).at(-1)
      if (last?.hora_llegada) horaFin = last.hora_llegada.slice(0, 5)
    }
  }

  if (!horaInicio && /^[78]\d{3}$/.test(turno.numero)) {
    const esMedHora = turno.numero[0] === '8'
    const horaBase  = parseInt(turno.numero.slice(1, 3), 10)
    const duracion  = parseInt(turno.numero[3], 10)
    const inicioMin = horaBase * 60 + (esMedHora ? 30 : 0)
    const finMin    = inicioMin + duracion * 60
    const fmt = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    horaInicio = fmt(inicioMin)
    horaFin    = fmt(finMin)
  }

  const mostrarHoras = !isDescanso && !isVacaciones && !!horaInicio && !!horaFin

  return (
    <button
      data-date={day.dateStr}
      onClick={() => onClick?.(day)}
      style={{ backgroundColor: bg, borderColor: border }}
      className={cn(
        'relative aspect-square rounded-xl flex flex-col p-1.5 border',
        'shadow-sm active:scale-95 transition-transform',
        day.isToday && 'ring-2 ring-red-500 ring-offset-1',
      )}
    >
      {/* Número del día */}
      <DayNumber dayNumber={day.dayNumber} isToday={day.isToday} isWeekend={isWeekend} />

      {/* Badge de cambio de turno (esquina superior derecha) */}
      {isCambio && (
        <div
          style={{ fontSize: dayNumFontSize(), backgroundColor: cambioColors.text, color: cambioColors.bg }}
          className="absolute top-0 right-0 w-[1.7em] h-[1.7em] rounded-tr-xl rounded-bl-xl
            flex items-center justify-center"
          aria-label="Turno cambiado"
        >
          <ArrowLeftRight style={{ width: '0.7em', height: '0.7em' }} />
        </div>
      )}

      {/* Código del turno arriba + horas ancladas abajo */}
      <div className="flex-1 flex flex-col" style={{ paddingTop: '0.5em' }}>
        {/* Turno: ocupa todo el espacio libre y se centra en él */}
        <div className="flex-1 flex items-center justify-center">
          <span
            style={{ color: turnoText, fontSize: turnoCodeFontSize(turno.numero.length) }}
            className="font-bold leading-none text-center"
          >
            {turno.numero}
          </span>
        </div>
        {/* Horas: fila fija al fondo */}
        {mostrarHoras && showTimes && (
          <span
            style={{ color: turnoText, fontSize: timeFontSize(), opacity: 0.78 }}
            className="font-medium leading-none text-center whitespace-nowrap self-center pb-px"
          >
            {horaInicio}·{horaFin}
          </span>
        )}
      </div>
    </button>
  )
}
