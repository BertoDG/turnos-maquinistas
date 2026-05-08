import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { usePendingUsers } from '@/hooks/usePendingUsers'
import type { PdfUpload, Profile } from '@/types'
import { formatDate } from '@/lib/utils'
import {
  Upload, Users, FileText, CheckCircle, XCircle,
  Clock, Loader2, ChevronRight, Plus, RefreshCw, AlertCircle,
  Trash2, ShieldAlert, ChevronDown,
} from 'lucide-react'

type ConfirmState = {
  title: string
  description: string
  rpc: string
  args?: Record<string, unknown>
}

const ESTADO_CONFIG = {
  pendiente:   { icon: Clock,       color: 'text-amber-500', bg: 'bg-amber-50',  label: 'Pendiente' },
  procesando:  { icon: Loader2,     color: 'text-blue-500',  bg: 'bg-blue-50',   label: 'Procesando' },
  completado:  { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50',  label: 'Completado' },
  error:       { icon: XCircle,     color: 'text-red-600',   bg: 'bg-red-50',    label: 'Error' },
} as const

export default function AdminPage() {
  const navigate    = useNavigate()
  const { isAdmin, profile } = useAuth()
  const isSuperAdmin = profile?.role === 'superadmin'
  const pendingUsers = usePendingUsers(isAdmin)

  const [uploads,      setUploads]      = useState<PdfUpload[]>([])
  const [maquinistas,  setMaquinistas]  = useState<Profile[]>([])
  const [loadingUploads, setLoadingUploads] = useState(true)

  // Mantenimiento
  const [mantOpen,     setMantOpen]     = useState(false)
  const [confirm,      setConfirm]      = useState<ConfirmState | null>(null)
  const [mantLoading,  setMantLoading]  = useState(false)
  const [mantResult,   setMantResult]   = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoadingUploads(true)
    try {
      const [{ data: uploadData }, { data: mqData }] = await Promise.all([
        supabase
          .from('pdf_uploads')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('profiles')
          .select('*')
          .eq('activo', true)
          .order('apellidos'),
      ])
      setUploads((uploadData ?? []) as PdfUpload[])
      setMaquinistas((mqData ?? []) as Profile[])
    } catch {
      // silent — data stays empty
    } finally {
      setLoadingUploads(false)
    }
  }

  async function runMantAction() {
    if (!confirm) return
    setMantLoading(true)
    setMantResult(null)
    const { data, error } = await supabase.rpc(confirm.rpc, confirm.args ?? {})
    setMantLoading(false)
    if (error) {
      setMantResult(`Error: ${error.message}`)
    } else {
      setMantResult(`Hecho. ${data ?? 0} registros eliminados.`)
      loadData()
    }
    setConfirm(null)
  }

  // Suscripción realtime al estado de los uploads
  useEffect(() => {
    const channel = supabase
      .channel('pdf_uploads_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pdf_uploads' },
        (payload) => {
          setUploads((prev) =>
            prev.map((u) => (u.id === payload.new.id ? (payload.new as PdfUpload) : u))
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-8">

      {/* Alerta de usuarios pendientes */}
      {pendingUsers > 0 && (
        <button
          onClick={() => navigate('/admin/usuarios')}
          className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5 text-left w-full hover:bg-amber-100 transition-colors"
        >
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">
              {pendingUsers} usuario{pendingUsers > 1 ? 's' : ''} pendiente{pendingUsers > 1 ? 's' : ''} de activación
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Toca para revisar y activar las cuentas
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        </button>
      )}

      {/* Stats rápidas */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Maquinistas activos"
          value={maquinistas.length}
          icon={Users}
          color="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="PDFs importados"
          value={uploads.filter(u => u.estado === 'completado').length}
          icon={FileText}
          color="bg-green-50 text-green-600"
        />
      </div>

      {/* Acciones rápidas */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden divide-y divide-gray-50 dark:divide-gray-700">
        <ActionRow
          icon={Upload}
          label="Subir PDF de turnos"
          description="Cargar catálogo o asignaciones"
          onClick={() => navigate('/admin/subir')}
          accent
        />
        <ActionRow
          icon={Users}
          label="Gestionar maquinistas"
          description={
            pendingUsers > 0
              ? `${maquinistas.length} activos · ${pendingUsers} pendiente${pendingUsers > 1 ? 's' : ''}`
              : `${maquinistas.length} usuarios activos`
          }
          onClick={() => navigate('/admin/usuarios')}
          badge={pendingUsers > 0 ? pendingUsers : undefined}
        />
        <ActionRow
          icon={RefreshCw}
          label="Recargar datos"
          description="Actualizar lista de uploads"
          onClick={loadData}
        />
      </div>

      {/* Historial de imports */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">Historial de importaciones</h3>
          <button
            onClick={() => navigate('/admin/subir')}
            className="text-xs text-red-600 font-semibold flex items-center gap-1 hover:text-red-700"
          >
            <Plus className="w-3 h-3" /> Nuevo
          </button>
        </div>

        {loadingUploads ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 text-red-400 animate-spin" />
          </div>
        ) : uploads.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 text-center border border-gray-100 dark:border-gray-700">
            <FileText className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No hay PDFs importados todavía</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden divide-y divide-gray-50 dark:divide-gray-700">
            {uploads.map((upload) => {
              const conf = ESTADO_CONFIG[upload.estado as keyof typeof ESTADO_CONFIG] ?? ESTADO_CONFIG.pendiente
              const Icon = conf.icon
              return (
                <div key={upload.id} className="px-4 py-3 flex gap-3 items-center">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${conf.bg}`}>
                    <Icon className={`w-4 h-4 ${conf.color} ${upload.estado === 'procesando' ? 'animate-spin' : ''}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{upload.filename}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {upload.tipo === 'catalogo_turnos' ? 'Catálogo de turnos'
                        : upload.tipo === 'lh_trenes'   ? 'LH-820 Trenes'
                        : 'Asignación maquinista'}
                      {upload.periodo_mes && upload.periodo_anio && (
                        <> · {upload.periodo_mes}/{upload.periodo_anio}</>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {formatDate(upload.created_at, "dd/MM/yyyy HH:mm")}
                      {upload.registros_creados > 0 && ` · ${upload.registros_creados} registros`}
                    </p>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${conf.bg} ${conf.color}`}>
                    {conf.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {/* Zona de mantenimiento — solo superadmin */}
      {isSuperAdmin && (
        <div className="rounded-2xl border border-red-100 bg-red-50 overflow-hidden">
          <button
            onClick={() => { setMantOpen(v => !v); setMantResult(null) }}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4 text-red-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-700">Zona de mantenimiento</p>
              <p className="text-xs text-red-500">Acciones destructivas · Solo superadmin</p>
            </div>
            <ChevronDown className={`w-4 h-4 text-red-400 transition-transform ${mantOpen ? 'rotate-180' : ''}`} />
          </button>

          {mantOpen && (
            <div className="px-4 pb-4 flex flex-col gap-2 border-t border-red-100">
              {mantResult && (
                <p className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2 mt-2">
                  {mantResult}
                </p>
              )}

              <MantItem
                label="Borrar asignaciones de un usuario"
                description="Elimina todos los turnos asignados a un maquinista"
                userList={maquinistas}
                onExecute={(userId, userName) => setConfirm({
                  title: `Borrar asignaciones de ${userName}`,
                  description: `Se eliminarán todas las asignaciones de ${userName}. Esta acción no se puede deshacer.`,
                  rpc: 'superadmin_borrar_asignaciones_usuario',
                  args: { p_user_id: userId },
                })}
              />

              <MantItem
                label="Limpiar catálogo de turnos"
                description="Borra todos los turnos y sus servicios del catálogo"
                onExecute={() => setConfirm({
                  title: 'Limpiar catálogo de turnos',
                  description: 'Se eliminarán todos los turnos y sus servicios. Las asignaciones existentes quedarán sin turno asociado.',
                  rpc: 'superadmin_limpiar_catalogo_turnos',
                })}
              />

              <MantItem
                label="Limpiar detalle de trenes (LH-820)"
                description="Borra todos los registros de lh_trenes"
                onExecute={() => setConfirm({
                  title: 'Limpiar LH-820',
                  description: 'Se eliminarán todos los trenes y sus paradas importados del LH-820.',
                  rpc: 'superadmin_limpiar_lh_trenes',
                })}
              />

              <MantItem
                label="Limpiar historial de uploads"
                description="Borra todos los registros del historial de importaciones"
                onExecute={() => setConfirm({
                  title: 'Limpiar historial de uploads',
                  description: 'Se eliminará todo el historial de importaciones de PDFs.',
                  rpc: 'superadmin_limpiar_pdf_uploads',
                })}
              />
            </div>
          )}
        </div>
      )}

      {/* Modal de confirmación */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900 text-center mb-2">{confirm.title}</h3>
            <p className="text-sm text-gray-500 text-center mb-6">{confirm.description}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                disabled={mantLoading}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={runMantAction}
                disabled={mantLoading}
                className="flex-1 py-3 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {mantLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Ejecutando…</>
                  : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function MantItem({ label, description, userList, onExecute }: {
  label: string
  description: string
  userList?: Profile[]
  onExecute: (userId?: string, userName?: string) => void
}) {
  const [selectedId, setSelectedId] = useState('')

  function handleClick() {
    if (userList) {
      if (!selectedId) return
      const u = userList.find(p => p.id === selectedId)
      onExecute(selectedId, u ? `${u.nombre} ${u.apellidos}` : selectedId)
    } else {
      onExecute()
    }
  }

  return (
    <div className="bg-white rounded-xl border border-red-100 p-3 flex flex-col gap-2">
      <div>
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      {userList && (
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-400"
        >
          <option value="">Selecciona un maquinista…</option>
          {userList.map(p => (
            <option key={p.id} value={p.id}>
              {p.nombre} {p.apellidos} ({p.matricula})
            </option>
          ))}
        </select>
      )}
      <button
        onClick={handleClick}
        disabled={!!userList && !selectedId}
        className="self-end px-4 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-40 flex items-center gap-1.5"
      >
        <Trash2 className="w-3 h-3" />
        Ejecutar
      </button>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ElementType; color: string
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">{label}</p>
      </div>
    </div>
  )
}

function ActionRow({ icon: Icon, label, description, onClick, accent, badge }: {
  icon: React.ElementType; label: string; description: string | React.ReactNode;
  onClick: () => void; accent?: boolean; badge?: number
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 transition-colors text-left"
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
        ${accent ? 'bg-red-600' : 'bg-gray-100 dark:bg-gray-700'}`}>
        <Icon className={`w-4 h-4 ${accent ? 'text-white' : 'text-gray-600 dark:text-gray-300'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${accent ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
      </div>
      {badge != null && badge > 0 && (
        <span className="min-w-[20px] h-5 px-1 bg-amber-500 text-white text-[10px] font-bold
          rounded-full flex items-center justify-center shrink-0">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
    </button>
  )
}
