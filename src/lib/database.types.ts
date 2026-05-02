// Tipos generados para Supabase TypeScript client
// Para regenerar: npx supabase gen types typescript --project-id TU_PROJECT_ID

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          matricula: string
          nombre: string
          apellidos: string
          depot: string | null
          role: 'maquinista' | 'admin' | 'superadmin'
          activo: boolean
          avatar_url: string | null
          telefono: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          matricula: string
          nombre: string
          apellidos: string
          depot?: string | null
          role?: 'maquinista' | 'admin' | 'superadmin'
          activo?: boolean
          avatar_url?: string | null
          telefono?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          matricula?: string
          nombre?: string
          apellidos?: string
          depot?: string | null
          role?: 'maquinista' | 'admin' | 'superadmin'
          activo?: boolean
          avatar_url?: string | null
          telefono?: string | null
          updated_at?: string
        }
      }
      turnos: {
        Row: {
          id: number
          numero: string
          tipo: string
          descripcion: string | null
          color_hex: string
          text_color_hex: string
          duracion_minutos: number | null
          km_totales: number | null
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          numero: string
          tipo?: string
          descripcion?: string | null
          color_hex?: string
          text_color_hex?: string
          duracion_minutos?: number | null
          km_totales?: number | null
          activo?: boolean
        }
        Update: {
          numero?: string
          tipo?: string
          descripcion?: string | null
          color_hex?: string
          text_color_hex?: string
          duracion_minutos?: number | null
          km_totales?: number | null
          activo?: boolean
        }
      }
      servicios_turno: {
        Row: {
          id: number
          turno_id: number
          orden: number
          numero_tren: string | null
          origen: string
          destino: string
          hora_salida: string
          hora_llegada: string
          dia_siguiente: boolean
          tipo_segmento: string
          km: number | null
          created_at: string
        }
        Insert: {
          turno_id: number
          orden?: number
          numero_tren?: string | null
          origen: string
          destino: string
          hora_salida: string
          hora_llegada: string
          dia_siguiente?: boolean
          tipo_segmento?: string
          km?: number | null
        }
        Update: {
          turno_id?: number
          orden?: number
          numero_tren?: string | null
          origen?: string
          destino?: string
          hora_salida?: string
          hora_llegada?: string
          dia_siguiente?: boolean
          tipo_segmento?: string
          km?: number | null
        }
      }
      asignaciones: {
        Row: {
          id: number
          maquinista_id: string
          fecha: string
          turno_id: number | null
          nota: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          maquinista_id: string
          fecha: string
          turno_id?: number | null
          nota?: string | null
        }
        Update: {
          maquinista_id?: string
          fecha?: string
          turno_id?: number | null
          nota?: string | null
        }
      }
      solicitudes_cambio: {
        Row: {
          id: number
          solicitante_id: string
          receptor_id: string
          fecha_solicitante: string
          fecha_receptor: string
          estado: string
          mensaje: string | null
          respuesta: string | null
          admin_aprobado: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          solicitante_id: string
          receptor_id: string
          fecha_solicitante: string
          fecha_receptor: string
          estado?: string
          mensaje?: string | null
          respuesta?: string | null
        }
        Update: {
          estado?: string
          mensaje?: string | null
          respuesta?: string | null
          admin_aprobado?: boolean | null
        }
      }
      pdf_uploads: {
        Row: {
          id: number
          filename: string
          tipo: string
          storage_path: string
          estado: string
          maquinista_matricula: string | null
          periodo_mes: number | null
          periodo_anio: number | null
          registros_creados: number
          errores_json: Json | null
          log_texto: string | null
          subido_por: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          filename: string
          tipo: string
          storage_path: string
          estado?: string
          maquinista_matricula?: string | null
          periodo_mes?: number | null
          periodo_anio?: number | null
          subido_por?: string | null
        }
        Update: {
          estado?: string
          registros_creados?: number
          errores_json?: Json | null
          log_texto?: string | null
        }
      }
      notificaciones: {
        Row: {
          id: number
          usuario_id: string
          tipo: string
          titulo: string
          contenido: string | null
          leida: boolean
          data_json: Json | null
          created_at: string
        }
        Insert: {
          usuario_id: string
          tipo: string
          titulo: string
          contenido?: string | null
          leida?: boolean
          data_json?: Json | null
        }
        Update: {
          leida?: boolean
        }
      }
    }
    Views: Record<string, never>
    Functions: {
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
    }
    Enums: Record<string, never>
  }
}
