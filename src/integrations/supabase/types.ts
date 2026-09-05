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
      activity_logs: {
        Row: {
          created_at: string
          detail: string
          event: string
          id: string
          ip: string | null
          suspicious: boolean
          tokens: number
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: string
          event: string
          id?: string
          ip?: string | null
          suspicious?: boolean
          tokens?: number
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: string
          event?: string
          id?: string
          ip?: string | null
          suspicious?: boolean
          tokens?: number
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          lang: string
          mind_id: string
          role: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          lang?: string
          mind_id: string
          role: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          lang?: string
          mind_id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      creator_personas: {
        Row: {
          avatar_url: string | null
          bio: string
          created_at: string
          handle: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string
          created_at?: string
          handle?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string
          created_at?: string
          handle?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      featured_minds: {
        Row: {
          created_at: string
          featured_by: string | null
          mind_id: string
          note: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          featured_by?: string | null
          mind_id: string
          note?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          featured_by?: string | null
          mind_id?: string
          note?: string
          updated_at?: string
        }
        Relationships: []
      }
      graph_links: {
        Row: {
          created_at: string
          id: string
          label: string
          persona_id: string | null
          source_key: string
          target_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          persona_id?: string | null
          source_key: string
          target_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          persona_id?: string | null
          source_key?: string
          target_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "graph_links_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "creator_personas"
            referencedColumns: ["id"]
          },
        ]
      }
      mind_comments: {
        Row: {
          author_name: string
          body: string
          created_at: string
          id: string
          mind_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          author_name?: string
          body: string
          created_at?: string
          id?: string
          mind_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          mind_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mind_purchases: {
        Row: {
          category: string
          created_at: string
          currency: string
          id: string
          mind_id: string
          price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          currency?: string
          id?: string
          mind_id: string
          price?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          currency?: string
          id?: string
          mind_id?: string
          price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mind_reviews: {
        Row: {
          author_name: string
          body: string
          created_at: string
          id: string
          mind_id: string
          paid_owner: boolean
          rating: number
          updated_at: string
          user_id: string
          verified_deployment: boolean
          video_proof_url: string | null
        }
        Insert: {
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          mind_id: string
          paid_owner?: boolean
          rating: number
          updated_at?: string
          user_id: string
          verified_deployment?: boolean
          video_proof_url?: string | null
        }
        Update: {
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          mind_id?: string
          paid_owner?: boolean
          rating?: number
          updated_at?: string
          user_id?: string
          verified_deployment?: boolean
          video_proof_url?: string | null
        }
        Relationships: []
      }
      mind_specs: {
        Row: {
          accuracy_score: number
          changelog_notes: string
          compatibility: string[]
          created_at: string
          id: string
          last_updated_at: string
          mind_id: string
          resolved_review_ids: string[]
          training_hours: number
          updated_at: string
          user_id: string
          version: string
        }
        Insert: {
          accuracy_score?: number
          changelog_notes?: string
          compatibility?: string[]
          created_at?: string
          id?: string
          last_updated_at?: string
          mind_id: string
          resolved_review_ids?: string[]
          training_hours?: number
          updated_at?: string
          user_id: string
          version?: string
        }
        Update: {
          accuracy_score?: number
          changelog_notes?: string
          compatibility?: string[]
          created_at?: string
          id?: string
          last_updated_at?: string
          mind_id?: string
          resolved_review_ids?: string[]
          training_hours?: number
          updated_at?: string
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      mind_vaults: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
          persona_id: string | null
          project_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          persona_id?: string | null
          project_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          persona_id?: string | null
          project_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mind_vaults_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "creator_personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mind_vaults_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mind_versions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          mind_id: string
          payload: Json
          release_notes: string
          title: string
          updated_at: string
          user_id: string
          vault_id: string
          version: string
          version_num: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          mind_id?: string
          payload?: Json
          release_notes?: string
          title?: string
          updated_at?: string
          user_id: string
          vault_id: string
          version?: string
          version_num?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          mind_id?: string
          payload?: Json
          release_notes?: string
          title?: string
          updated_at?: string
          user_id?: string
          vault_id?: string
          version?: string
          version_num?: number
        }
        Relationships: [
          {
            foreignKeyName: "mind_versions_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "mind_vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_jobs: {
        Row: {
          chunks: Json
          created_at: string
          custom_instructions: string
          id: string
          last_error: string | null
          next_index: number
          playlist_id: string | null
          primary_focus: string
          queue_position: number
          results: Json
          retry_after: string | null
          source_kind: string
          source_label: string
          source_url: string
          status: string
          total_chunks: number
          updated_at: string
          user_id: string
          vault_id: string | null
          video_context: string
        }
        Insert: {
          chunks?: Json
          created_at?: string
          custom_instructions?: string
          id?: string
          last_error?: string | null
          next_index?: number
          playlist_id?: string | null
          primary_focus?: string
          queue_position?: number
          results?: Json
          retry_after?: string | null
          source_kind?: string
          source_label?: string
          source_url: string
          status?: string
          total_chunks?: number
          updated_at?: string
          user_id: string
          vault_id?: string | null
          video_context?: string
        }
        Update: {
          chunks?: Json
          created_at?: string
          custom_instructions?: string
          id?: string
          last_error?: string | null
          next_index?: number
          playlist_id?: string | null
          primary_focus?: string
          queue_position?: number
          results?: Json
          retry_after?: string | null
          source_kind?: string
          source_label?: string
          source_url?: string
          status?: string
          total_chunks?: number
          updated_at?: string
          user_id?: string
          vault_id?: string | null
          video_context?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_content: {
        Row: {
          created_at: string
          description: string
          emotion_timeline: Json
          id: string
          kind: string
          mind_id: string
          project_id: string
          source_url: string
          tags: string[]
          timeline: Json
          title: string
          transcript: Json
          updated_at: string
          user_id: string
          view_count: number
          youtube_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          emotion_timeline?: Json
          id?: string
          kind?: string
          mind_id?: string
          project_id: string
          source_url?: string
          tags?: string[]
          timeline?: Json
          title?: string
          transcript?: Json
          updated_at?: string
          user_id: string
          view_count?: number
          youtube_id?: string
        }
        Update: {
          created_at?: string
          description?: string
          emotion_timeline?: Json
          id?: string
          kind?: string
          mind_id?: string
          project_id?: string
          source_url?: string
          tags?: string[]
          timeline?: Json
          title?: string
          transcript?: Json
          updated_at?: string
          user_id?: string
          view_count?: number
          youtube_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_content_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          cover_url: string | null
          created_at: string
          creator_avatar_url: string | null
          creator_name: string
          currency: string
          description: string
          id: string
          persona_id: string | null
          price: number
          published: boolean
          title: string
          updated_at: string
          user_id: string
          view_count: number
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          creator_avatar_url?: string | null
          creator_name?: string
          currency?: string
          description?: string
          id?: string
          persona_id?: string | null
          price?: number
          published?: boolean
          title?: string
          updated_at?: string
          user_id: string
          view_count?: number
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          creator_avatar_url?: string | null
          creator_name?: string
          currency?: string
          description?: string
          id?: string
          persona_id?: string | null
          price?: number
          published?: boolean
          title?: string
          updated_at?: string
          user_id?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "projects_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "creator_personas"
            referencedColumns: ["id"]
          },
        ]
      }
      robot_packages: {
        Row: {
          created_at: string
          deploy_token: string
          id: string
          mind_id: string
          package: Json
          published: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deploy_token?: string
          id?: string
          mind_id: string
          package?: Json
          published?: boolean
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deploy_token?: string
          id?: string
          mind_id?: string
          package?: Json
          published?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_flags: {
        Row: {
          ban_reason: string
          banned: boolean
          created_at: string
          unlimited_quota: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          ban_reason?: string
          banned?: boolean
          created_at?: string
          unlimited_quota?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          ban_reason?: string
          banned?: boolean
          created_at?: string
          unlimited_quota?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_published_mind_package: {
        Args: { _token: string }
        Returns: {
          mind_id: string
          package: Json
          title: string
          updated_at: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_banned: { Args: { _user_id: string }; Returns: boolean }
      rollback_mind_version: {
        Args: { _version_id: string }
        Returns: {
          vault_id: string
          version: string
        }[]
      }
      save_mind_version: {
        Args: {
          _mind_id?: string
          _payload: Json
          _release_notes?: string
          _title: string
          _vault_id: string
        }
        Returns: {
          vault_id: string
          version: string
          version_id: string
          version_num: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
