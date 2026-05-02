import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Calendar, Users, ArrowLeftRight, Settings, User } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  icon: React.ElementType
  label: string
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', icon: Calendar, label: 'Turnos' },
  { to: '/companeros', icon: Users, label: 'Compañeros' },
  { to: '/cambios', icon: ArrowLeftRight, label: 'Cambios' },
  { to: '/perfil', icon: User, label: 'Perfil' },
  { to: '/admin', icon: Settings, label: 'Admin', adminOnly: true },
]

export default function BottomNav() {
  const { isAdmin } = useAuth()
  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin)

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch h-16">
        {visibleItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 pt-2 pb-1 transition-colors relative',
                isActive ? 'text-red-600' : 'text-gray-400 hover:text-gray-600'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-red-600 rounded-full" />
                )}
                <Icon className={cn('w-5 h-5', isActive && 'fill-red-50')} strokeWidth={isActive ? 2.5 : 1.8} />
                <span className="text-[10px] font-medium leading-none">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
