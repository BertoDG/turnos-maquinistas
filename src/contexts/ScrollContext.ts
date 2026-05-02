import { createContext, useContext } from 'react'

export const MainScrollContext = createContext<React.RefObject<HTMLElement> | null>(null)

export function useMainScroll() {
  return useContext(MainScrollContext)
}
