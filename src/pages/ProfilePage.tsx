import { useState, useRef, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { parseMaquinistaAsignacion } from '@/lib/pdfParser'
import { getInitials } from '@/lib/utils'
import { useColorPrefs } from '@/contexts/ColorPrefsContext'
import { DEFAULT_COLOR_PREFS } from '@/lib/colorPrefs'
import type { ColorPrefs, ColorPrefKey, SlotColorProp } from '@/lib/colorPrefs'
import { getTurnoMeta } from '@/lib/turnoNomenclatura'
import {
  LogOut, Train, User, Shield, ChevronRight,
  Upload, FileText, X, CheckCircle, AlertCircle, Loader2, Palette, RotateCcw, Trash2, Pencil, Check,
} from 'lucide-react'

// ── Tipos de estado ────────────────────────────────────────────
type UploadStatus = 'idle' | 'leyendo' | 'guardando' | 'done' | 'error'

interface UploadState {
  status: UploadStatus
  message: string
  count?: number
}

// ══════════════════════════════════════════════════════════════
export default function ProfilePage() {
  const { profile, signOut, isAdmin, refreshProfile } = useAuth()

  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle', message: '' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Edición de datos personales ──────────────────────────────
  const [editingProfile, setEditingProfile] = useState(false)
  const [editForm,       setEditForm]       = useState({ nombre: '', apellidos: '', matricula: '', depot: '', telefono: '' })
  const [editSaving,     setEditSaving]     = useState(false)
  const [editError,      setEditError]      = useState<string | null>(null)
  const [editSaved,      setEditSaved]      = useState(false)

  function openEdit() {
    setEditForm({
      nombre:    profile?.nombre    ?? '',
      apellidos: profile?.apellidos ?? '',
      matricula: profile?.matricula ?? '',
      depot:     profile?.depot     ?? '',
      telefono:  profile?.telefono  ?? '',
    })
    setEditError(null)
    setEditSaved(false)
    setEditingProfile(true)
  }

  async function handleEditSave() {
    if (!editForm.nombre.trim() || !editForm.apellidos.trim() || !editForm.matricula.trim()) {
      setEditError('Nombre, apellidos y matrícula son obligatorios.')
      return
    }
    setEditSaving(true)
    setEditError(null)
    const { error } = await supabase
      .from('profiles')
      .update({
        nombre:    editForm.nombre.trim(),
        apellidos: editForm.apellidos.trim(),
        matricula: editForm.matricula.trim(),
        depot:     editForm.depot.trim()    || null,
        telefono:  editForm.telefono.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile!.id)
    setEditSaving(false)
    if (error) { setEditError(error.message); return }
    setEditSaved(true)
    await refreshProfile()
    setTimeout(() => { setEditingProfile(false); setEditSaved(false) }, 800)
  }

  // ── Eliminar cuenta ──────────────────────────────────────────
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingAccount,   setDeletingAccount]   = useState(false)
  const [deleteError,       setDeleteError]       = useState<string | null>(null)

  async function handleDeleteAccount() {
    setDeletingAccount(true)
    setDeleteError(null)
    const { error } = await supabase.rpc('usuario_borrar_propia_cuenta')
    if (error) {
      setDeletingAccount(false)
      setDeleteError(error.message)
      return
    }
    // La cuenta ha sido borrada en BD; cerrar sesión local
    await signOut()
  }

  if (!profile) return null

  // ── Drag & drop ──────────────────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f?.type === 'application/pdf') {
      setFile(f)
      setUploadState({ status: 'idle', message: '' })
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f?.type === 'application/pdf') {
      setFile(f)
      setUploadState({ status: 'idle', message: '' })
    }
  }

  // ── Subida y proceso ─────────────────────────────────────────
  async function handleUpload() {
    if (!file) return

    try {
      setUploadState({ status: 'leyendo', message: 'Leyendo tu PDF…' })

      const parsed = await parseMaquinistaAsignacion(file)

      // Verificar que el PDF corresponde a este usuario
      if (parsed.matricula && parsed.matricula !== profile.matricula) {
        setUploadState({
          status: 'error',
          message: `Este PDF es de la matrícula ${parsed.matricula}, no de la tuya (${profile.matricula}).`,
        })
        return
      }

      if (parsed.asignaciones.length === 0) {
        setUploadState({ status: 'error', message: 'No se encontraron asignaciones en el PDF.' })
        return
      }

      setUploadState({ status: 'guardando', message: `Guardando ${parsed.asignaciones.length} días…` })

      // 1. Upsert de turnos (crear los que no existan)
      const codigosUnicos = [...new Set(parsed.asignaciones.map(a => a.turno_codigo))]
      const turnoRows = codigosUnicos.map(c => ({ numero: c, ...getTurnoMeta(c) }))

      const { error: turnoErr } = await supabase
        .from('turnos')
        .upsert(turnoRows, { onConflict: 'numero', ignoreDuplicates: true })
      if (turnoErr) throw new Error('Error en turnos: ' + turnoErr.message)

      // 2. Obtener IDs de turnos
      const { data: turnosData, error: turnosQueryErr } = await supabase
        .from('turnos')
        .select('id, numero')
        .in('numero', codigosUnicos)
      if (turnosQueryErr || !turnosData) throw new Error('Error obteniendo IDs de turnos')

      const turnoIdMap = new Map(turnosData.map(t => [t.numero, t.id]))

      // 3. Upsert de asignaciones en lotes
      const rows = parsed.asignaciones
        .map(a => {
          const turnoId = turnoIdMap.get(a.turno_codigo)
          if (!turnoId) return null
          return { maquinista_id: profile.id, fecha: a.fecha, turno_id: turnoId }
        })
        .filter(Boolean) as { maquinista_id: string; fecha: string; turno_id: number }[]

      const BATCH = 200
      let inserted = 0
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH)
        const { error: asignErr } = await supabase
          .from('asignaciones')
          .upsert(batch, { onConflict: 'maquinista_id,fecha' })
        if (asignErr) throw new Error('Error guardando asignaciones: ' + asignErr.message)
        inserted += batch.length
        setUploadState({ status: 'guardando', message: `Guardando… ${inserted} / ${rows.length}` })
      }

      // 4. Registrar en historial
      await supabase.from('pdf_uploads').insert({
        filename: file.name,
        tipo: 'asignacion_maquinista',
        storage_path: '',
        estado: 'completado',
        maquinista_matricula: profile.matricula,
        periodo_anio: parsed.year,
        subido_por: profile.id,
        registros_creados: inserted,
        log_texto: `Subido por el propio maquinista. ${inserted} asignaciones.`,
      })

      setUploadState({ status: 'done', message: '¡Turnos importados correctamente!', count: inserted })
      setFile(null)
    } catch (e) {
      setUploadState({
        status: 'error',
        message: e instanceof Error ? e.message : 'Error inesperado',
      })
    }
  }

  const isLoading = uploadState.status === 'leyendo' || uploadState.status === 'guardando'

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-8">

      {/* Avatar y nombre */}
      <div className="bg-white rounded-2xl p-6 flex flex-col items-center shadow-sm border border-gray-100">
        <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center
          text-red-700 font-bold text-2xl mb-3">
          {getInitials(profile.nombre, profile.apellidos)}
        </div>
        <h2 className="text-lg font-bold text-gray-900 text-center">
          {profile.nombre} {profile.apellidos}
        </h2>
        <p className="text-gray-500 text-sm mt-0.5">Matrícula: {profile.matricula}</p>
        {isAdmin && (
          <span className="mt-2 bg-red-100 text-red-700 text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
            <Shield className="w-3 h-3" />
            Administrador
          </span>
        )}
      </div>

      {/* Datos personales */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Cabecera con botón editar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Mis datos</p>
          <button
            onClick={editingProfile ? () => setEditingProfile(false) : openEdit}
            className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors
              ${editingProfile ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
          >
            {editingProfile
              ? <><X className="w-3 h-3" />Cancelar</>
              : <><Pencil className="w-3 h-3" />Editar</>
            }
          </button>
        </div>

        {editingProfile ? (
          /* Formulario de edición */
          <div className="px-4 py-4 flex flex-col gap-3">
            {editError && (
              <div className="flex items-start gap-2 bg-red-50 text-red-700 text-xs rounded-xl px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {editError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Nombre <span className="text-red-500">*</span></label>
                <input
                  value={editForm.nombre}
                  onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl
                    focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-400"
                  placeholder="Ej: Carlos"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Apellidos <span className="text-red-500">*</span></label>
                <input
                  value={editForm.apellidos}
                  onChange={e => setEditForm(f => ({ ...f, apellidos: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl
                    focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-400"
                  placeholder="Ej: García"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Matrícula <span className="text-red-500">*</span></label>
                <input
                  value={editForm.matricula}
                  onChange={e => setEditForm(f => ({ ...f, matricula: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl
                    focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-400"
                  placeholder="Ej: 87654"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Depósito</label>
                <input
                  value={editForm.depot}
                  onChange={e => setEditForm(f => ({ ...f, depot: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl
                    focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-400"
                  placeholder="Ej: GIJON"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Teléfono</label>
              <input
                type="tel"
                value={editForm.telefono}
                onChange={e => setEditForm(f => ({ ...f, telefono: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl
                  focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-400"
                placeholder="Ej: 600 123 456"
              />
            </div>
            <button
              onClick={handleEditSave}
              disabled={editSaving}
              className="w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold
                hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {editSaving
                ? <><Loader2 className="w-4 h-4 animate-spin" />Guardando...</>
                : editSaved
                ? <><Check className="w-4 h-4" />Guardado</>
                : <><Check className="w-4 h-4" />Guardar cambios</>
              }
            </button>
          </div>
        ) : (
          /* Vista de datos */
          <div className="divide-y divide-gray-50">
            <InfoRow icon={User}  label="Nombre"    value={`${profile.nombre} ${profile.apellidos}`} />
            <InfoRow icon={Train} label="Matrícula" value={profile.matricula} />
            <InfoRow icon={Train} label="Depósito"  value={profile.depot ?? 'No asignado'} />
            <InfoRow icon={Shield} label="Rol"      value={
              profile.role === 'superadmin' ? 'Superadministrador'
              : profile.role === 'admin'    ? 'Administrador'
              : 'Maquinista'
            } />
            {profile.telefono && (
              <InfoRow icon={User} label="Teléfono" value={profile.telefono} />
            )}
          </div>
        )}
      </div>

      {/* ── Subir PDF de turnos ─────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-800">Mis turnos</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Sube el PDF "Desarrollo Anual" que te ha enviado RENFE para importar todos tus turnos.
          </p>
        </div>

        {/* Zona de fichero */}
        {!file ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex items-center justify-center gap-3 px-4 py-5 rounded-xl border-2 border-dashed
              cursor-pointer transition-all
              ${isDragging ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-red-300 hover:bg-red-50'}`}
          >
            <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
            <Upload className="w-5 h-5 text-gray-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-700">Seleccionar PDF de turnos</p>
              <p className="text-xs text-gray-400">Arrastra aquí o pulsa para buscar</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-3 py-3 bg-red-50 rounded-xl">
            <FileText className="w-5 h-5 text-red-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
              <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            {!isLoading && (
              <button
                onClick={() => { setFile(null); setUploadState({ status: 'idle', message: '' }) }}
                className="p-1.5 rounded-lg bg-white hover:bg-gray-100 transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5 text-gray-500" />
              </button>
            )}
          </div>
        )}

        {/* Feedback de estado */}
        {uploadState.status !== 'idle' && (
          <div className={`flex gap-2 items-start px-3 py-2.5 rounded-xl text-sm
            ${uploadState.status === 'done'  ? 'bg-green-50 text-green-800' :
              uploadState.status === 'error' ? 'bg-red-50 text-red-800' :
              'bg-blue-50 text-blue-800'}`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5" />
            ) : uploadState.status === 'done' ? (
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-medium leading-snug">{uploadState.message}</p>
              {uploadState.count !== undefined && (
                <p className="text-xs opacity-75 mt-0.5">{uploadState.count} días importados</p>
              )}
            </div>
          </div>
        )}

        {/* Botón de subida */}
        {file && uploadState.status !== 'done' && (
          <button
            onClick={handleUpload}
            disabled={isLoading}
            className="w-full py-3 rounded-xl bg-red-600 text-white text-sm font-semibold
              hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors
              flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {isLoading ? uploadState.message : 'Importar mis turnos'}
          </button>
        )}
      </div>

      {/* ── Colores del calendario ──────────────────────────── */}
      <ColorEditor />

      {/* Cerrar sesión */}
      <button
        onClick={signOut}
        className="w-full flex items-center justify-between px-4 py-4 bg-white rounded-2xl
          border border-gray-100 shadow-sm text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <LogOut className="w-5 h-5" />
          <span className="font-medium text-sm">Cerrar sesión</span>
        </div>
        <ChevronRight className="w-4 h-4 text-red-400" />
      </button>

      {/* Zona de peligro: eliminar cuenta */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Zona de peligro</p>
        </div>
        <button
          onClick={() => { setShowDeleteConfirm(true); setDeleteError(null) }}
          className="w-full flex items-center justify-between px-4 py-4
            text-gray-500 hover:bg-red-50 hover:text-red-600 active:bg-red-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Trash2 className="w-5 h-5" />
            <div className="text-left">
              <span className="font-medium text-sm block">Eliminar mi cuenta</span>
              <span className="text-xs text-gray-400">Borra todos tus datos permanentemente</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300" />
        </button>
      </div>

      <p className="text-center text-xs text-gray-400 mt-2">TurnosMaq v0.1 · Uso interno RENFE</p>

      {/* Modal confirmación borrar cuenta */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900 text-center mb-1">
              Eliminar mi cuenta
            </h3>
            <p className="text-sm text-gray-500 text-center mb-1">
              Se eliminarán <span className="font-semibold text-gray-800">todos tus datos</span>: turnos, cambios y deudas.
            </p>
            <p className="text-xs text-gray-400 text-center mb-5">
              Esta acción no se puede deshacer.
            </p>

            {deleteError && (
              <div className="flex items-start gap-2 bg-red-50 text-red-700 text-xs rounded-xl px-3 py-2 mb-4">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {deleteError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deletingAccount}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium
                  text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deletingAccount}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold
                  hover:bg-red-700 disabled:opacity-50 transition-colors
                  flex items-center justify-center gap-2"
              >
                {deletingAccount
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Eliminando...</>
                  : <><Trash2 className="w-4 h-4" />Eliminar todo</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Editor de colores del calendario ─────────────────────────────────────────

interface SlotDef {
  key:      ColorPrefKey
  label:    string
  sublabel: string
  sample:   string
}

const SLOTS: SlotDef[] = [
  { key: 'servicio_manana',     label: 'Mañana',     sublabel: 'Tren',    sample: '4157' },
  { key: 'guardia_manana',      label: 'Mañana',     sublabel: 'Guardia', sample: '7063' },
  { key: 'servicio_intermedio', label: 'Intermedio', sublabel: 'Tren',    sample: '4235' },
  { key: 'guardia_intermedio',  label: 'Intermedio', sublabel: 'Guardia', sample: '7143' },
  { key: 'servicio_tarde',      label: 'Tarde',      sublabel: 'Tren',    sample: '4829' },
  { key: 'guardia_tarde',       label: 'Tarde',      sublabel: 'Guardia', sample: '8156' },
  { key: 'libre',               label: 'Libre',      sublabel: 'D / VB',  sample: 'D'   },
  { key: 'cambio',              label: 'Cambiado',   sublabel: '↔ Swap',  sample: '↔'   },
]

const PROP_LABELS: Record<SlotColorProp, string> = {
  bg:     'Fondo',
  text:   'Letra',
  border: 'Marco',
}

function ColorEditor() {
  const { prefs, savePrefs, resetPrefs } = useColorPrefs()
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  async function handleChange(key: ColorPrefKey, prop: SlotColorProp, color: string) {
    const next: ColorPrefs = {
      ...prefs,
      [key]: { ...prefs[key], [prop]: color },
    }
    setSaving(true); setSaved(false)
    await savePrefs(next)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  async function handleResetSlot(key: ColorPrefKey) {
    const next: ColorPrefs = { ...prefs, [key]: DEFAULT_COLOR_PREFS[key] }
    setSaving(true); setSaved(false)
    await savePrefs(next)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  async function handleToggleHoras() {
    const next: ColorPrefs = { ...prefs, mostrar_horas: !prefs.mostrar_horas }
    setSaving(true); setSaved(false)
    await savePrefs(next)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  async function handleToggleHeredarColor() {
    const next: ColorPrefs = { ...prefs, cambio_heredar_color: !prefs.cambio_heredar_color }
    setSaving(true); setSaved(false)
    await savePrefs(next)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-bold text-gray-800">Personalización del Calendario</h3>
        </div>
        <div className="flex items-center gap-2">
          {saving && <span className="text-xs text-gray-400">Guardando…</span>}
          {saved  && <span className="text-xs text-green-600 font-medium">✓ Guardado</span>}
        </div>
      </div>

      {/* Toggle: mostrar horas en celda */}
      <button
        onClick={handleToggleHoras}
        className="flex items-center justify-between w-full px-3 py-2.5
          bg-gray-50 rounded-xl border border-gray-100 active:bg-gray-100 transition-colors"
      >
        <div className="flex flex-col items-start gap-0.5">
          <span className="text-sm font-medium text-gray-800">Mostrar horas en el calendario</span>
          <span className="text-xs text-gray-400">Hora de inicio y fin en cada celda del día</span>
        </div>
        <div className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ml-3
          ${prefs.mostrar_horas ? 'bg-red-500' : 'bg-gray-300'}`}
        >
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform
            ${prefs.mostrar_horas ? 'translate-x-5' : 'translate-x-0.5'}`}
          />
        </div>
      </button>

      {/* Toggle: días cambiados heredan color del nuevo turno */}
      <button
        onClick={handleToggleHeredarColor}
        className="flex items-center justify-between w-full px-3 py-2.5
          bg-gray-50 rounded-xl border border-gray-100 active:bg-gray-100 transition-colors"
      >
        <div className="flex flex-col items-start gap-0.5">
          <span className="text-sm font-medium text-gray-800">Color heredado en días cambiados</span>
          <span className="text-xs text-gray-400">Usa el color del nuevo turno en lugar del color fijo</span>
        </div>
        <div className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ml-3
          ${prefs.cambio_heredar_color ? 'bg-red-500' : 'bg-gray-300'}`}
        >
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform
            ${prefs.cambio_heredar_color ? 'translate-x-5' : 'translate-x-0.5'}`}
          />
        </div>
      </button>

      {/* Grid de slots: 2 columnas */}
      <div className="grid grid-cols-2 gap-3">
        {SLOTS.map(slot => {
          const s        = prefs[slot.key]
          const def      = DEFAULT_COLOR_PREFS[slot.key]
          const modified = JSON.stringify(s) !== JSON.stringify(def)

          return (
            <div key={slot.key} className="flex flex-col gap-1.5">
              {/* Preview de la celda + botón restaurar individual */}
              <div className="relative">
                <div
                  style={{
                    backgroundColor: s.bg,
                    borderColor:      s.border,
                    borderWidth:      2,
                  }}
                  className="rounded-xl p-2 flex flex-col gap-0.5"
                >
                  <span style={{ color: s.text }} className="text-[9px] font-semibold opacity-60 leading-none">
                    {slot.sublabel}
                  </span>
                  <span style={{ color: s.text }} className="text-lg font-bold leading-none">
                    {slot.sample}
                  </span>
                  <span style={{ color: s.text }} className="text-[8px] opacity-50 leading-none mt-0.5">
                    {slot.label}
                  </span>
                </div>

                {/* Botón restaurar solo si este slot fue modificado */}
                {modified && (
                  <button
                    onClick={() => handleResetSlot(slot.key)}
                    title="Restaurar por defecto"
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/20
                      flex items-center justify-center hover:bg-black/40 transition-colors"
                  >
                    <RotateCcw className="w-2.5 h-2.5 text-white" />
                  </button>
                )}
              </div>

              {/* 3 pickers: Fondo · Letra · Marco */}
              <div className="flex gap-1">
                {(['bg', 'text', 'border'] as SlotColorProp[]).map(prop => (
                  <label
                    key={prop}
                    className="relative flex-1 flex flex-col items-center gap-0.5 cursor-pointer group"
                  >
                    <div
                      style={{ backgroundColor: s[prop] }}
                      className="w-full h-5 rounded-md border border-gray-200
                        group-hover:scale-110 transition-transform"
                    />
                    <span className="text-[8px] text-gray-400 leading-none">
                      {PROP_LABELS[prop]}
                    </span>
                    <input
                      type="color"
                      value={s[prop]}
                      onChange={e => handleChange(slot.key, prop, e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-[10px] text-gray-400 text-center">
        Toca Fondo · Letra · Marco de cada tipo para personalizar
      </p>
    </div>
  )
}

// ── Fila de datos del perfil ──────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value }: {
  icon: React.ElementType; label: string; value: string
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-gray-500" />
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-900">{value}</p>
      </div>
    </div>
  )
}
