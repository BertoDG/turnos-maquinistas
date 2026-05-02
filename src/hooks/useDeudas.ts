import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { DeudaCambio, Profile } from '@/types'

export interface DeudaBalance {
  companeroId: string
  companero: Profile | null
  /** Deudas donde yo soy acreedor (el compañero me debe días) */
  meDebeItems: DeudaCambio[]
  /** Deudas donde yo soy deudor (yo le debo días al compañero) */
  leDeboItems: DeudaCambio[]
  meDebeCount: number
  leDeboCount: number
}

export function useDeudas(userId: string | undefined) {
  const [balances, setBalances] = useState<DeudaBalance[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    setLoading(true)

    const { data } = await supabase
      .from('deudas_cambio')
      .select(`
        *,
        acreedor:profiles!deudas_cambio_acreedor_id_fkey(*),
        deudor:profiles!deudas_cambio_deudor_id_fkey(*)
      `)
      .or(`acreedor_id.eq.${userId},deudor_id.eq.${userId}`)
      .eq('saldada', false)
      .order('created_at', { ascending: true })

    const deudas = (data ?? []) as DeudaCambio[]

    // Agrupar por compañero
    const map = new Map<string, DeudaBalance>()

    for (const d of deudas) {
      const isAcreedor = d.acreedor_id === userId
      const companeroId = isAcreedor ? d.deudor_id : d.acreedor_id
      const companeroProfile = isAcreedor
        ? (d.deudor as Profile | null)
        : (d.acreedor as Profile | null)

      if (!map.has(companeroId)) {
        map.set(companeroId, {
          companeroId,
          companero: companeroProfile,
          meDebeItems: [],
          leDeboItems: [],
          meDebeCount: 0,
          leDeboCount: 0,
        })
      }
      const entry = map.get(companeroId)!
      if (isAcreedor) {
        entry.meDebeItems.push(d)
        entry.meDebeCount++
      } else {
        entry.leDeboItems.push(d)
        entry.leDeboCount++
      }
    }

    setBalances(Array.from(map.values()))
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  async function saldar(deudaId: number) {
    await supabase.rpc('saldar_deuda', { p_deuda_id: deudaId })
    await load()
  }

  // Totales globales
  const totalMeDeben = balances.reduce((s, b) => s + b.meDebeCount, 0)
  const totalDebo    = balances.reduce((s, b) => s + b.leDeboCount, 0)

  // Mapa por companeroId para búsqueda rápida
  const byCompanero = Object.fromEntries(balances.map((b) => [b.companeroId, b]))

  return { balances, byCompanero, totalMeDeben, totalDebo, loading, saldar, reload: load }
}
