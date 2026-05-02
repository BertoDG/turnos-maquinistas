import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Carga el mapa de códigos de estación → nombre completo desde Supabase.
 * Si un código no tiene nombre configurado, devuelve el propio código.
 */
export function useEstaciones(): (codigo: string) => string {
  const [mapa, setMapa] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    supabase
      .from('estaciones')
      .select('codigo, nombre')
      .then(({ data }) => {
        if (data) {
          setMapa(new Map(data.map(e => [e.codigo, e.nombre])))
        }
      })
  }, [])

  return (codigo: string) => mapa.get(codigo) ?? codigo
}
