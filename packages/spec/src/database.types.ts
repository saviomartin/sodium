export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      api_tokens: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          label: string
          last_four: string
          last_used_at: string | null
          owner_id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          label?: string
          last_four: string
          last_used_at?: string | null
          owner_id: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          label?: string
          last_four?: string
          last_used_at?: string | null
          owner_id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: []
      }
      cli_auth_requests: {
        Row: {
          authorized_at: string | null
          consumed_at: string | null
          created_at: string
          device_hash: string
          expires_at: string
          id: string
          user_code: string
          user_id: string | null
        }
        Insert: {
          authorized_at?: string | null
          consumed_at?: string | null
          created_at?: string
          device_hash: string
          expires_at: string
          id?: string
          user_code: string
          user_id?: string | null
        }
        Update: {
          authorized_at?: string | null
          consumed_at?: string | null
          created_at?: string
          device_hash?: string
          expires_at?: string
          id?: string
          user_code?: string
          user_id?: string | null
        }
        Relationships: []
      }
      deployments: {
        Row: {
          config: Json
          config_hash: string
          created_at: string
          id: string
          project_id: string
          tool_count: number
          version: number
        }
        Insert: {
          config: Json
          config_hash: string
          created_at?: string
          id: string
          project_id: string
          tool_count: number
          version: number
        }
        Update: {
          config?: Json
          config_hash?: string
          created_at?: string
          id?: string
          project_id?: string
          tool_count?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "deployments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          current_deployment_id: string | null
          id: string
          name: string
          owner_id: string
          publishable_key_hash: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_deployment_id?: string | null
          id: string
          name: string
          owner_id: string
          publishable_key_hash: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_deployment_id?: string | null
          id?: string
          name?: string
          owner_id?: string
          publishable_key_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_current_deployment_fk"
            columns: ["current_deployment_id"]
            isOneToOne: false
            referencedRelation: "deployments"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          config_version: number | null
          deployment_id: string | null
          duration_ms: number | null
          error_code: string | null
          event: string
          id: number
          invocation_id: string | null
          occurred_at: string
          project_id: string
          received_at: string
          sdk_version: string
          tool_id: string | null
          tool_name: string | null
        }
        Insert: {
          config_version?: number | null
          deployment_id?: string | null
          duration_ms?: number | null
          error_code?: string | null
          event: string
          id?: never
          invocation_id?: string | null
          occurred_at: string
          project_id: string
          received_at?: string
          sdk_version: string
          tool_id?: string | null
          tool_name?: string | null
        }
        Update: {
          config_version?: number | null
          deployment_id?: string | null
          duration_ms?: number | null
          error_code?: string | null
          event?: string
          id?: never
          invocation_id?: string | null
          occurred_at?: string
          project_id?: string
          received_at?: string
          sdk_version?: string
          tool_id?: string | null
          tool_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "deployments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_or_rotate_project: {
        Args: {
          p_name: string
          p_owner_id: string
          p_project_id: string
          p_publishable_key_hash: string
        }
        Returns: string
      }
      create_project_deployment: {
        Args: {
          p_config: Json
          p_config_hash: string
          p_deployment_id: string
          p_owner_id: string
          p_project_id: string
          p_tool_count: number
        }
        Returns: {
          deployment_hash: string
          deployment_id: string
          deployment_version: number
        }[]
      }
      exchange_cli_auth: {
        Args: {
          p_device_hash: string
          p_last_four: string
          p_token_hash: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
