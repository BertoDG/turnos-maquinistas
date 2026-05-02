import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Notificacion } from '@/types'

export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<Notificacion[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('notificaciones')
      .select('*')
      .eq('usuario_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
    setNotifications((data ?? []) as Notificacion[])
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  // Realtime: nuevas notificaciones sin recargar
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`notificaciones_${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `usuario_id=eq.${userId}` },
        (payload) => {
          setNotifications((prev) => [payload.new as Notificacion, ...prev])
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  async function markAsRead(notifId: number) {
    await supabase.from('notificaciones').update({ leida: true }).eq('id', notifId)
    setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, leida: true } : n)))
  }

  async function markAllAsRead() {
    if (!userId) return
    await supabase.from('notificaciones').update({ leida: true }).eq('usuario_id', userId).eq('leida', false)
    setNotifications((prev) => prev.map((n) => ({ ...n, leida: true })))
  }

  const unreadCount = notifications.filter((n) => !n.leida).length

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead }
}
