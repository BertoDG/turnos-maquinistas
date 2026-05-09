import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useDeudas } from '@/hooks/useDeudas'
import type { Profile } from '@/types'
import { Search, Train, ChevronRight, Users, Loader2, Eye } from 'lucide-react'
import { getInitials } from '@/lib/utils'

export default function ColleaguesPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [colleagues, setColleagues] = useState<Profile[]>([])
  const [filtered, setFiltered] = useState<Profile[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const { byCompanero } = useDeudas(profile?.id)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .eq('activo', true)
      .neq('id', profile?.id ?? '')
      .order('apellidos', { ascending: true })
      .then(({ data }) => {
        const c = (data ?? []) as Profile[]
        setColleagues(c)
        setFiltered(c)
        setLoading(false)
      })
  }, [profile?.id])

  useEffect(() => {
    const q = search.toLowerCase().trim()
    if (!q) {
      setFiltered(colleagues)
      return
    }
    setFiltered(
      colleagues.filter(
        (c) =>
          c.nombre.toLowerCase().includes(q) ||
          c.apellidos.toLowerCase().includes(q) ||
          c.matricula.includes(q) ||
          (c.depot ?? '').toLowerCase().includes(q)
      )
    )
  }, [search, colleagues])

  // Agrupar por depot
  const byDepot = filtered.reduce<Record<string, Profile[]>>((acc, c) => {
    const d = c.depot ?? 'Sin depósito'
    if (!acc[d]) acc[d] = []
    acc[d].push(c)
    return acc
  }, {})

  return (
    <div className="flex flex-col min-h-full">
      {/* Buscador */}
      <div className="px-4 pt-4 pb-2 bg-white sticky top-0 z-10 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, matrícula o depósito..."
            className="w-full pl-9 pr-4 py-2.5 text-sm bg-gray-100 rounded-xl border-none
              focus:outline-none focus:ring-2 focus:ring-red-400 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 text-red-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Users className="w-12 h-12 text-gray-300" />
          <p className="text-gray-500 text-sm">
            {search ? 'No se encontraron compañeros' : 'No hay compañeros en el sistema'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-0 pb-4">
          {Object.entries(byDepot).map(([depot, people]) => (
            <section key={depot}>
              <div className="px-4 py-2 mt-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Train className="w-3 h-3" />
                  {depot}
                  <span className="font-normal text-gray-300">· {people.length}</span>
                </p>
              </div>

              <div className="bg-white mx-3 rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
                {people.map((person) => {
                  const bal = byCompanero[person.id]
                  return (
                    <button
                      key={person.id}
                      onClick={() => navigate(`/companeros/${person.id}`)}
                      className="w-full flex items-center gap-3 px-4 py-3.5
                        hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                    >
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center
                        text-gray-600 font-bold text-sm shrink-0">
                        {getInitials(person.nombre, person.apellidos)}
                      </div>

                      {/* Nombre + deuda */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">
                          {person.apellidos}, {person.nombre}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-xs text-gray-500">Matrícula: {person.matricula}</p>
                          {person.turnos_visibles && (
                            <span className="flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full
                              bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                              <Eye className="w-2.5 h-2.5" />
                              Comparte
                            </span>
                          )}
                          {bal && bal.meDebeCount > 0 && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full
                              bg-green-100 text-green-700">
                              Te debe {bal.meDebeCount}d
                            </span>
                          )}
                          {bal && bal.leDeboCount > 0 && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full
                              bg-amber-100 text-amber-700">
                              Le debes {bal.leDeboCount}d
                            </span>
                          )}
                        </div>
                      </div>

                      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
