import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Profile, UserRole } from '@/types'
import { getInitials } from '@/lib/utils'
import {
  Users, Plus, X, Loader2, Eye, EyeOff,
  ToggleLeft, ToggleRight, ChevronDown, ChevronUp,
  UserCheck, ShieldCheck, Shield, User, Pencil, Check,
  Clock, AlertCircle, Trash2, Search,
} from 'lucide-react'

const ROLE_CONFIG: Record<UserRole, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  maquinista: { label: 'Maquinista', bg: 'bg-blue-50',   text: 'text-blue-700',   icon: User        },
  admin:      { label: 'Admin',      bg: 'bg-orange-50', text: 'text-orange-700', icon: Shield      },
  superadmin: { label: 'Superadmin', bg: 'bg-red-50',    text: 'text-red-700',    icon: ShieldCheck },
}

interface NewUserForm {
  matricula: string; password: string; nombre: string
  apellidos: string; role: UserRole; depot: string; telefono: string
}
const FORM_EMPTY: NewUserForm = {
  matricula: '', password: '', nombre: '', apellidos: '',
  role: 'maquinista', depot: '', telefono: '',
}

// ════════════════════════════════════════════════════════════
type SortKey = 'nombre_asc' | 'nombre_desc' | 'estado' | 'rol'

export default function UsersPage() {
  const { profile: myProfile } = useAuth()
  const myRole = myProfile?.role ?? 'admin'

  const [profiles,     setProfiles]     = useState<Profile[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [filterActivo, setFilterActivo] = useState<'todos' | 'activos' | 'inactivos'>('todos')
  const [sortKey,      setSortKey]      = useState<SortKey>('estado')
  const [search,       setSearch]       = useState('')
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Profile | null>(null)
  const [deleting,      setDeleting]      = useState(false)

  useEffect(() => { loadProfiles() }, [])

  async function loadProfiles() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('activo').order('apellidos')
    setProfiles((data ?? []) as Profile[])
    setLoading(false)
  }

  async function toggleActivo(p: Profile) {
    const { error } = await supabase.rpc('admin_set_activo', {
      p_user_id: p.id,
      p_activo:  !p.activo,
    })
    if (error) {
      alert(`Error al cambiar el estado: ${error.message}`)
      return
    }
    // Recarga completa para reflejar el nuevo estado correctamente
    await loadProfiles()
  }

  async function handleDelete(p: Profile) {
    setDeleting(true)
    const { error } = await supabase.rpc('admin_borrar_maquinista', { p_user_id: p.id })
    setDeleting(false)
    setConfirmDelete(null)
    if (error) { alert(`Error al eliminar: ${error.message}`); return }
    await loadProfiles()
  }

  // Pendiente = sin activar Y sin perfil completado
  const pendingCount = profiles.filter(p => !p.activo && !p.nombre && !p.apellidos).length
  const activeCount  = profiles.filter(p => p.activo).length
  const inactiveCount = profiles.filter(p => !p.activo).length

  const searchLower = search.trim().toLowerCase()

  const filtered = profiles.filter(p => {
    if (filterActivo === 'activos'   && !p.activo) return false
    if (filterActivo === 'inactivos' &&  p.activo) return false
    if (!searchLower) return true
    return (
      p.nombre?.toLowerCase().includes(searchLower)    ||
      p.apellidos?.toLowerCase().includes(searchLower) ||
      p.matricula?.toLowerCase().includes(searchLower) ||
      p.depot?.toLowerCase().includes(searchLower)
    )
  })

  const ROLE_ORDER: Record<string, number> = { superadmin: 0, admin: 1, maquinista: 2 }

  const sorted = [...filtered].sort((a, b) => {
    const aPending = !a.activo && !a.nombre && !a.apellidos
    const bPending = !b.activo && !b.nombre && !b.apellidos

    if (sortKey === 'nombre_asc') {
      // Pendientes al final
      if (aPending && !bPending) return 1
      if (!aPending && bPending) return -1
      const aName = `${a.apellidos ?? ''} ${a.nombre ?? ''}`.trim()
      const bName = `${b.apellidos ?? ''} ${b.nombre ?? ''}`.trim()
      return aName.localeCompare(bName, 'es')
    }

    if (sortKey === 'nombre_desc') {
      if (aPending && !bPending) return 1
      if (!aPending && bPending) return -1
      const aName = `${a.apellidos ?? ''} ${a.nombre ?? ''}`.trim()
      const bName = `${b.apellidos ?? ''} ${b.nombre ?? ''}`.trim()
      return bName.localeCompare(aName, 'es')
    }

    if (sortKey === 'rol') {
      if (aPending && !bPending) return 1
      if (!aPending && bPending) return -1
      const rDiff = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
      if (rDiff !== 0) return rDiff
      return (a.apellidos ?? '').localeCompare(b.apellidos ?? '', 'es')
    }

    // 'estado' (por defecto): pendientes → inactivos → activos
    if (aPending && !bPending) return -1
    if (!aPending && bPending) return 1
    if (!a.activo && b.activo) return -1
    if (a.activo && !b.activo) return 1
    return (a.apellidos ?? '').localeCompare(b.apellidos ?? '', 'es')
  })

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-8">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">Gestión de usuarios</h2>
          <p className="text-xs text-gray-500">
            {activeCount} activos · {inactiveCount} inactivos
            {pendingCount > 0 && (
              <span className="ml-1.5 font-semibold text-amber-600">· {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}</span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 text-white
            text-sm font-semibold shadow-md shadow-red-600/20 hover:bg-red-700 active:bg-red-800 transition-colors"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancelar' : 'Nuevo'}
        </button>
      </div>

      {/* Formulario de creación */}
      {showForm && (
        <NewUserFormPanel
          callerRole={myRole}
          onSuccess={() => { setShowForm(false); loadProfiles() }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Aviso pendientes */}
      {pendingCount > 0 && !showForm && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{pendingCount} usuario{pendingCount > 1 ? 's' : ''}</span> {pendingCount > 1 ? 'están esperando' : 'está esperando'} que completes su perfil y lo actives.
          </p>
        </div>
      )}

      {/* Filtros, búsqueda y ordenación */}
      <div className="flex flex-col gap-2">
        {/* Fila superior: filtro por estado + buscador */}
        <div className="flex gap-2 items-center">
          {(['todos', 'activos', 'inactivos'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterActivo(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-colors
                ${filterActivo === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >
              {f}
            </button>
          ))}

          {/* Buscador */}
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar…"
              className="pl-7 pr-7 py-1.5 rounded-xl text-xs bg-gray-100 border border-transparent
                focus:outline-none focus:ring-2 focus:ring-red-400 focus:bg-white w-32 focus:w-44
                transition-all placeholder:text-gray-400 text-gray-800"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Ordenación */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide shrink-0">Orden:</span>
          <div className="flex gap-1.5 flex-wrap">
            {([
              ['estado',      'Estado'],
              ['nombre_asc',  'A → Z'],
              ['nombre_desc', 'Z → A'],
              ['rol',         'Rol'],
            ] as [SortKey, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortKey(key)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors
                  ${sortKey === key ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-gray-100">
          <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No hay usuarios en esta categoría</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
          {sorted.map(p => (
            <UserRow
              key={p.id}
              profile={p}
              callerId={myProfile?.id ?? ''}
              callerRole={myRole}
              isEditing={editingId === p.id}
              onToggle={() => toggleActivo(p)}
              onEdit={() => setEditingId(editingId === p.id ? null : p.id)}
              onSaved={() => { setEditingId(null); loadProfiles() }}
              onDelete={() => setConfirmDelete(p)}
            />
          ))}
        </div>
      )}

      {/* Modal de confirmación de borrado */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900 text-center mb-1">
              Eliminar maquinista
            </h3>
            <p className="text-sm text-gray-500 text-center mb-1">
              Se eliminarán todos los datos de{' '}
              <span className="font-semibold text-gray-800">
                {confirmDelete.nombre
                  ? `${confirmDelete.nombre} ${confirmDelete.apellidos}`
                  : confirmDelete.matricula}
              </span>
            </p>
            <p className="text-xs text-gray-400 text-center mb-6">
              Asignaciones, cambios de turno y deudas. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium
                  text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold
                  hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {deleting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Trash2 className="w-4 h-4" />
                }
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── UserRow ──────────────────────────────────────────────────

function UserRow({ profile: p, callerId, callerRole, isEditing, onToggle, onEdit, onSaved, onDelete }: {
  profile: Profile
  callerId: string
  callerRole: string
  isEditing: boolean
  onToggle: () => void
  onEdit: () => void
  onSaved: () => void
  onDelete: () => void
}) {
  // pendiente = sin activar y sin perfil → admin debe activar
  // incompleto = activado pero sin nombre → usuario debe completar perfil
  const isPending    = !p.activo && !p.nombre && !p.apellidos
  const isIncomplete = p.activo  && !p.nombre && !p.apellidos
  const rConf = ROLE_CONFIG[p.role]
  const RoleIcon = rConf.icon

  // Un admin puede operar sobre maquinistas y su propio perfil.
  // Superadmin puede operar sobre cualquiera.
  const isSelf     = p.id === callerId
  const canOperate = callerRole === 'superadmin' || p.role === 'maquinista' || isSelf

  return (
    <div className={`transition-opacity ${!p.activo && !isPending ? 'opacity-50' : ''}`}>
      {/* Fila principal */}
      <div className={`px-4 py-3 flex items-center gap-3
        ${isPending ? 'bg-amber-50/60' : isIncomplete ? 'bg-blue-50/40' : ''}`}>
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center
          font-bold text-sm shrink-0 overflow-hidden
          ${isPending ? 'bg-amber-100 text-amber-700' : isIncomplete ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
          {p.avatar_url
            ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
            : isPending    ? <Clock className="w-5 h-5" />
            : isIncomplete ? <User  className="w-5 h-5" />
            : getInitials(p.nombre, p.apellidos)
          }
        </div>

        {/* Datos */}
        <div className="flex-1 min-w-0">
          {isPending ? (
            <>
              <p className="text-sm font-semibold text-amber-800 truncate">Pendiente de activar</p>
              <p className="text-xs text-amber-600 truncate">{p.matricula}</p>
            </>
          ) : isIncomplete ? (
            <>
              <p className="text-sm font-semibold text-blue-700 truncate">Activado · completando perfil</p>
              <p className="text-xs text-blue-500 truncate">{p.matricula}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-900 truncate">
                {p.nombre} {p.apellidos}
              </p>
              <p className="text-xs text-gray-500">
                {p.matricula}{p.depot ? ` · ${p.depot}` : ''}{p.telefono ? ` · ${p.telefono}` : ''}
              </p>
            </>
          )}
        </div>

        {/* Badge rol (solo si perfil completo) */}
        {!isPending && !isIncomplete && (
          <span className={`hidden sm:flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5
            rounded-full shrink-0 ${rConf.bg} ${rConf.text}`}>
            <RoleIcon className="w-3 h-3" />
            {rConf.label}
          </span>
        )}

        {isPending ? (
          /* Pendiente: botón prominente de activar (solo si puede operar) */
          canOperate ? (
            <button
              onClick={onToggle}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold
                bg-green-600 text-white hover:bg-green-700 active:bg-green-800 transition-colors"
            >
              <UserCheck className="w-3.5 h-3.5" />
              Activar
            </button>
          ) : (
            <span className="shrink-0 text-[10px] text-gray-400 italic pr-1">Solo lectura</span>
          )
        ) : isIncomplete ? (
          /* Activado pero pendiente de que el usuario complete su perfil */
          canOperate ? (
            <button
              onClick={onToggle}
              title="Desactivar"
              className="shrink-0 p-1 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ToggleRight className="w-6 h-6 text-green-500" />
            </button>
          ) : (
            <span className="shrink-0 text-[10px] text-gray-400 italic pr-1">Solo lectura</span>
          )
        ) : canOperate ? (
          <>
            {/* Borrar */}
            <button
              onClick={onDelete}
              title="Eliminar usuario"
              className="shrink-0 p-1.5 rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Editar perfil */}
            <button
              onClick={onEdit}
              title="Editar perfil"
              className={`shrink-0 p-1.5 rounded-lg transition-colors
                ${isEditing ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'}`}
            >
              {isEditing ? <ChevronUp className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            </button>

            {/* Toggle activo/inactivo */}
            <button
              onClick={onToggle}
              title={p.activo ? 'Desactivar' : 'Activar'}
              className="shrink-0 p-1 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {p.activo
                ? <ToggleRight className="w-6 h-6 text-green-500" />
                : <ToggleLeft  className="w-6 h-6 text-gray-300" />
              }
            </button>
          </>
        ) : (
          /* Admin viendo a otro admin: solo lectura */
          <span className="shrink-0 text-[10px] text-gray-400 italic pr-1">Solo lectura</span>
        )}
      </div>

      {/* Formulario de edición inline */}
      {isEditing && (
        <EditProfileForm profile={p} callerRole={callerRole} onSaved={onSaved} onCancel={onEdit} />
      )}
    </div>
  )
}

// ── EditProfileForm ──────────────────────────────────────────

function EditProfileForm({ profile: p, callerRole, onSaved, onCancel }: {
  profile: Profile
  callerRole: string
  onSaved: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    matricula: p.matricula ?? '',
    nombre:    p.nombre    ?? '',
    apellidos: p.apellidos ?? '',
    role:      p.role      as UserRole,
    depot:     p.depot     ?? '',
    telefono:  p.telefono  ?? '',
    activo:    p.activo,
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  function set(field: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  async function handleSave() {
    if (!form.nombre.trim() || !form.apellidos.trim() || !form.matricula.trim()) {
      setError('Nombre, apellidos y matrícula son obligatorios.')
      return
    }
    setLoading(true)
    const { error: rpcErr } = await supabase.rpc('admin_actualizar_perfil', {
      p_user_id:   p.id,
      p_matricula: form.matricula.trim(),
      p_nombre:    form.nombre.trim(),
      p_apellidos: form.apellidos.trim(),
      p_role:      form.role,
      p_depot:     form.depot.trim()    || null,
      p_telefono:  form.telefono.trim() || null,
      p_activo:    form.activo,
    })
    setLoading(false)
    if (rpcErr) { setError(rpcErr.message); return }
    onSaved()
  }

  const inputCls = `w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl
    focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-400`

  return (
    <div className="border-t border-gray-100 bg-gray-50/80 px-4 py-4 flex flex-col gap-3">
      {error && (
        <div className="bg-red-50 text-red-700 text-xs rounded-xl px-3 py-2 border border-red-100">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Nombre <span className="text-red-500">*</span></label>
          <input value={form.nombre} onChange={e => set('nombre', e.target.value)}
            placeholder="Ej: Carlos" className={inputCls} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Apellidos <span className="text-red-500">*</span></label>
          <input value={form.apellidos} onChange={e => set('apellidos', e.target.value)}
            placeholder="Ej: García López" className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Matrícula <span className="text-red-500">*</span></label>
          <input value={form.matricula} onChange={e => set('matricula', e.target.value)}
            placeholder="Ej: 87654" className={inputCls} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Depósito</label>
          <input value={form.depot} onChange={e => set('depot', e.target.value)}
            placeholder="Ej: GIJON" className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Teléfono</label>
          <input type="tel" value={form.telefono} onChange={e => set('telefono', e.target.value)}
            placeholder="600 123 456" className={inputCls} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Rol</label>
          <select value={form.role} onChange={e => set('role', e.target.value)} className={inputCls}>
            <option value="maquinista">Maquinista</option>
            {callerRole === 'superadmin' && <option value="admin">Admin</option>}
            {callerRole === 'superadmin' && <option value="superadmin">Superadmin</option>}
          </select>
        </div>
      </div>

      {/* Activo toggle */}
      <label className="flex items-center gap-2.5 cursor-pointer">
        <div
          onClick={() => set('activo', !form.activo)}
          className={`relative w-10 h-6 rounded-full transition-colors ${form.activo ? 'bg-green-500' : 'bg-gray-300'}`}
        >
          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all
            ${form.activo ? 'left-5' : 'left-1'}`} />
        </div>
        <span className="text-sm font-medium text-gray-700">
          {form.activo ? 'Cuenta activa' : 'Cuenta inactiva'}
        </span>
      </label>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium
            text-gray-600 hover:bg-white transition-colors">
          Cancelar
        </button>
        <button type="button" onClick={handleSave} disabled={loading}
          className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold
            hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {loading ? 'Guardando...' : 'Guardar y activar'}
        </button>
      </div>
    </div>
  )
}

// ── NewUserFormPanel ─────────────────────────────────────────

function NewUserFormPanel({ callerRole, onSuccess, onCancel }: { callerRole: string; onSuccess: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<NewUserForm>(FORM_EMPTY)
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [showAdv,  setShowAdv]  = useState(false)

  function set(field: keyof NewUserForm, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.matricula || !form.password || !form.nombre || !form.apellidos) {
      setError('Rellena todos los campos obligatorios.')
      return
    }
    if (form.password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    setLoading(true)
    const { error: rpcError } = await supabase.rpc('admin_crear_usuario', {
      p_matricula: form.matricula.trim(),
      p_password:  form.password,
      p_nombre:    form.nombre.trim(),
      p_apellidos: form.apellidos.trim(),
      p_role:      form.role,
      p_depot:     form.depot.trim()    || null,
      p_telefono:  form.telefono.trim() || null,
    })
    setLoading(false)
    if (rpcError) {
      const msg = rpcError.message ?? 'Error al crear el usuario.'
      if (msg.includes('Matrícula ya registrada')) setError(`La matrícula ${form.matricula} ya está en uso.`)
      else if (msg.includes('No autorizado'))      setError('No tienes permisos para crear usuarios.')
      else setError(msg)
      return
    }
    onSuccess()
  }

  const inputCls = `w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl
    focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-400`

  return (
    <form onSubmit={handleSubmit}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
      <h3 className="text-sm font-bold text-gray-800">Nuevo maquinista</h3>

      {error && (
        <div className="bg-red-50 text-red-700 text-xs rounded-xl px-3 py-2 border border-red-100">{error}</div>
      )}

      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Matrícula <span className="text-red-500">*</span></label>
        <input value={form.matricula} onChange={e => set('matricula', e.target.value)}
          placeholder="Ej: 87654" className={inputCls} required />
        {form.matricula && (
          <p className="text-[10px] text-gray-400 mt-1 ml-1">
            Email interno: {form.matricula.toLowerCase()}@turnosmaq.internal
          </p>
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Contraseña temporal <span className="text-red-500">*</span></label>
        <div className="relative">
          <input type={showPass ? 'text' : 'password'} value={form.password}
            onChange={e => set('password', e.target.value)}
            placeholder="Mínimo 8 caracteres" className={`${inputCls} pr-10`} required />
          <button type="button" onClick={() => setShowPass(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Nombre <span className="text-red-500">*</span></label>
          <input value={form.nombre} onChange={e => set('nombre', e.target.value)}
            placeholder="Ej: Carlos" className={inputCls} required />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Apellidos <span className="text-red-500">*</span></label>
          <input value={form.apellidos} onChange={e => set('apellidos', e.target.value)}
            placeholder="Ej: García López" className={inputCls} required />
        </div>
      </div>

      <button type="button" onClick={() => setShowAdv(v => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 self-start">
        {showAdv ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        Opciones avanzadas
      </button>

      {showAdv && (
        <div className="flex flex-col gap-3 pt-1 border-t border-gray-50">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Rol</label>
            <select value={form.role} onChange={e => set('role', e.target.value)} className={inputCls}>
              <option value="maquinista">Maquinista</option>
              {callerRole === 'superadmin' && <option value="admin">Admin</option>}
              {callerRole === 'superadmin' && <option value="superadmin">Superadmin</option>}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Depósito</label>
              <input value={form.depot} onChange={e => set('depot', e.target.value)}
                placeholder="Ej: GIJON" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Teléfono</label>
              <input type="tel" value={form.telefono} onChange={e => set('telefono', e.target.value)}
                placeholder="600 123 456" className={inputCls} />
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium
            text-gray-600 hover:bg-gray-50 transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={loading}
          className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold
            hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
          {loading ? 'Creando...' : 'Crear usuario'}
        </button>
      </div>
    </form>
  )
}
