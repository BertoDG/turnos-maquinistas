import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// Contador global para garantizar nombres de canal únicos por instancia.
// Necesario porque usePendingUsers se monta en varios componentes simultáneamente
// (AdminPage + BottomNav) y Supabase Realtime no permite añadir listeners a un
// canal ya suscrito.
let instanceCounter = 0

/**
 * Devuelve el número de usuarios con activo=false.
 * Solo hace la consulta si el usuario es admin/superadmin.
 */
export function usePendingUsers(isAdmin: boolean): number {
  const [count, setCount] = useState(0)
  // Nombre de canal único y estable para esta instancia del hook
  const channelNameRef = useRef<string | null>(null)
  if (channelNameRef.current === null) {
    channelNameRef.current = `pending_users_count_${++instanceCounter}`
  }

  useEffect(() => {
    if (!isAdmin) return

    let cancelled = false

    async function load() {
      const { count: n } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('activo', false)

      if (!cancelled) setCount(n ?? 0)
    }

    load()

    // Suscripción realtime con nombre de canal único por instancia
    const channel = supabase
      .channel(channelNameRef.current!)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => { load() }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [isAdmin])

  return count
}
