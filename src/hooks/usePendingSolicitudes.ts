import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Devuelve el número de solicitudes de cambio recibidas que están pendientes
 * de respuesta. Se actualiza en tiempo real via Supabase Realtime.
 */
export function usePendingSolicitudes(userId: string | undefined): number {
  const [count, setCount] = useState(0)

  const load = useCallback(async () => {
    if (!userId) { setCount(0); return }
    const { count: c } = await supabase
      .from('solicitudes_cambio')
      .select('*', { count: 'exact', head: true })
      .eq('receptor_id', userId)
      .eq('estado', 'pendiente')
    setCount(c ?? 0)
  }, [userId])

  useEffect(() => { load() }, [load])

  // Realtime: actualizar cuando cambie cualquier solicitud que me afecte
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`pending_solicitudes_${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'solicitudes_cambio',
          filter: `receptor_id=eq.${userId}`,
        },
        () => { load() }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, load])

  return count
}
