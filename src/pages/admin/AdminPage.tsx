import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { PdfUpload, Profile } from '@/types'
import { formatDate } from '@/lib/utils'
import {
  Upload, Users, FileText, CheckCircle, XCircle,
  Clock, Loader2, ChevronRight, Plus, RefreshCw
} from 'lucide-react'

const ESTADO_CONFIG = {
  pendiente:   { icon: Clock,       color: 'text-amber-500', bg: 'bg-amber-50',  label: 'Pendiente' },
  procesando:  { icon: Loader2,     color: 'text-blue-500',  bg: 'bg-blue-50',   label: 'Procesando' },
  completado:  { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50',  label: 'Completado' },
  error:       { icon: XCircle,     color: 'text-red-600',   bg: 'bg-red-50',    label: 'Error' },
} as const

export default function AdminPage() {
  const navigate = useNavigate()
  const [uploads, setUploads] = useState<PdfUpload[]>([])
  const [maquinistas, setMaquinistas] = useState<Profile[]>([])
  const [loadingUploads, setLoadingUploads] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoadingUploads(true)

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
    setLoadingUploads(false)
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
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
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
          description={`${maquinistas.length} usuarios activos`}
          onClick={() => navigate('/admin/usuarios')}
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
          <h3 className="text-sm font-bold text-gray-700">Historial de importaciones</h3>
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
          <div className="bg-white rounded-2xl p-6 text-center border border-gray-100">
            <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No hay PDFs importados todavía</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
            {uploads.map((upload) => {
              const conf = ESTADO_CONFIG[upload.estado]
              const Icon = conf.icon
              return (
                <div key={upload.id} className="px-4 py-3 flex gap-3 items-center">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${conf.bg}`}>
                    <Icon className={`w-4 h-4 ${conf.color} ${upload.estado === 'procesando' ? 'animate-spin' : ''}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{upload.filename}</p>
                    <p className="text-xs text-gray-500">
                      {upload.tipo === 'catalogo_turnos' ? 'Catálogo de turnos' : 'Asignación maquinista'}
                      {upload.periodo_mes && upload.periodo_anio && (
                        <> · {upload.periodo_mes}/{upload.periodo_anio}</>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">
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
    </div>
  )
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ElementType; color: string
}) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500 leading-tight">{label}</p>
      </div>
    </div>
  )
}

function ActionRow({ icon: Icon, label, description, onClick, accent }: {
  icon: React.ElementType; label: string; description: string;
  onClick: () => void; accent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
        ${accent ? 'bg-red-600' : 'bg-gray-100'}`}>
        <Icon className={`w-4 h-4 ${accent ? 'text-white' : 'text-gray-600'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${accent ? 'text-red-600' : 'text-gray-900'}`}>{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
    </button>
  )
}
