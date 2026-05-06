import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import DayCell from './DayCell'
import { useColorPrefs } from '@/contexts/ColorPrefsContext'
import type { CalendarMonth, CalendarDay } from '@/types'

const DIAS = [
  { medio: 'LUN', largo: 'Lunes'     },
  { medio: 'MAR', largo: 'Martes'    },
  { medio: 'MIÉ', largo: 'Miércoles' },
  { medio: 'JUE', largo: 'Jueves'    },
  { medio: 'VIE', largo: 'Viernes'   },
  { medio: 'SÁB', largo: 'Sábado'    },
  { medio: 'DOM', largo: 'Domingo'   },
]

// ── Detectar si hay espacio para mostrar las horas ────────────────────────────
// Las celdas miden (ancho_pantalla - padding - gaps) / 7.
// Con padding px-3 (24px) y 6 gaps de 4px: ancho_celda = (W - 48) / 7.
// Umbral 350px → celda ≈ 43px, suficiente para leer horas en iPhone estándar.
function useShowTimes(): boolean {
  const [show, setShow] = useState(() => window.innerWidth >= 350)
  useEffect(() => {
    const handler = () => setShow(window.innerWidth >= 350)
    window.addEventListener('resize', handler, { passive: true })
    return () => window.removeEventListener('resize', handler)
  }, [])
  return show
}

interface MonthCalendarProps {
  month: CalendarMonth
  maquinistaId?: string
}

export default function MonthCalendar({ month, maquinistaId }: MonthCalendarProps) {
  const navigate        = useNavigate()
  const { prefs }       = useColorPrefs()
  const viewportFits    = useShowTimes()
  // Las horas se muestran solo si el usuario las activó Y la pantalla tiene espacio
  const showTimes       = prefs.mostrar_horas && viewportFits

  function handleDayClick(day: CalendarDay) {
    if (!day.dateStr) return
    if (maquinistaId) {
      navigate(`/dia/${day.dateStr}?maquinistaId=${maquinistaId}`)
    } else {
      navigate(`/dia/${day.dateStr}`)
    }
  }

  return (
    <section className="mb-6">
      {/* Cabecera del mes */}
      <div className="px-4 py-3">
        <h2 className="text-base font-bold text-gray-900 dark:text-white capitalize">
          {month.label}
        </h2>
      </div>

      {/* Cabecera de días de la semana */}
      <div className="grid grid-cols-7 gap-1 px-3 mb-1.5">
        {DIAS.map((d, i) => {
          const isWeekend = i >= 5
          return (
            <div
              key={d.largo}
              className={`flex items-center justify-center rounded-lg py-1
                ${isWeekend
                  ? 'bg-red-50 dark:bg-red-900/30'
                  : 'bg-gray-100 dark:bg-gray-800'}`}
            >
              <span className={`text-[11px] font-bold tracking-wide leading-none
                ${isWeekend
                  ? 'text-red-400 dark:text-red-400'
                  : 'text-gray-400 dark:text-gray-500'}`}>
                {d.medio}
              </span>
            </div>
          )
        })}
      </div>

      {/* Grid de días */}
      <div className="grid grid-cols-7 gap-1 px-3">
        {month.days.map((day, idx) => (
          <DayCell
            key={day.dateStr || `empty-${idx}`}
            day={day}
            showTimes={showTimes}
            onClick={handleDayClick}
          />
        ))}
      </div>
    </section>
  )
}
