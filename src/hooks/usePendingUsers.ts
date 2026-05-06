import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Devuelve el número de usuarios con activo=false.
 * Solo hace la consulta si el usuario es admin/superadmin.
 */
export function usePendingUsers(isAdmin: boolean): number {
  const [count, setCount] = useState(0)

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

    // Suscripción realtime a cambios en profiles
    const channel = supabase
      .channel('pending_users_count')
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
