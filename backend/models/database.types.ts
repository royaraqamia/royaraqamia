export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      analytics_events: {
        Row: {
          clicked_at: string;
          id: string;
          ip_country: string | null;
          link_code: string | null;
          referrer: string | null;
          user_agent: string | null;
        };
        Insert: {
          clicked_at?: string;
          id?: string;
          ip_country?: string | null;
          link_code?: string | null;
          referrer?: string | null;
          user_agent?: string | null;
        };
        Update: {
          clicked_at?: string;
          id?: string;
          ip_country?: string | null;
          link_code?: string | null;
          referrer?: string | null;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'analytics_events_link_code_fkey';
            columns: ['link_code'];
            isOneToOne: false;
            referencedRelation: 'short_links';
            referencedColumns: ['code'];
          },
        ];
      };
      app_settings: {
        Row: {
          admin_emails: string[];
          id: boolean;
        };
        Insert: {
          admin_emails?: string[];
          id?: boolean;
        };
        Update: {
          admin_emails?: string[];
          id?: boolean;
        };
        Relationships: [];
      };
      budgets: {
        Row: {
          amount: number;
          category_id: string | null;
          created_at: string;
          id: string;
          month: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          category_id?: string | null;
          created_at?: string;
          id?: string;
          month: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          category_id?: string | null;
          created_at?: string;
          id?: string;
          month?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'budgets_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      blog_categories: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      blog_tags: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          color_hex: string;
          created_at: string;
          id: string;
          is_default: boolean;
          name: string;
          user_id: string | null;
        };
        Insert: {
          color_hex: string;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          name: string;
          user_id?: string | null;
        };
        Update: {
          color_hex?: string;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          name?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      certificates: {
        Row: {
          certificate_code: string;
          course_name: string;
          created_at: string;
          expiration_date: string | null;
          grade_or_status: string | null;
          id: string;
          issue_date: string;
          recipient_email: string | null;
          recipient_user_ids: string[];
          student_name: string;
        };
        Insert: {
          certificate_code: string;
          course_name: string;
          created_at?: string;
          expiration_date?: string | null;
          grade_or_status?: string | null;
          id?: string;
          issue_date: string;
          recipient_email?: string | null;
          recipient_user_ids?: string[];
          student_name: string;
        };
        Update: {
          certificate_code?: string;
          course_name?: string;
          created_at?: string;
          expiration_date?: string | null;
          grade_or_status?: string | null;
          id?: string;
          issue_date?: string;
          recipient_email?: string | null;
          recipient_user_ids?: string[];
          student_name?: string;
        };
        Relationships: [];
      };
      expenses: {
        Row: {
          amount: number;
          category_id: string;
          created_at: string;
          date: string;
          description: string | null;
          id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          category_id: string;
          created_at?: string;
          date: string;
          description?: string | null;
          id?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          category_id?: string;
          created_at?: string;
          date?: string;
          description?: string | null;
          id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'expenses_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      recurring_expenses: {
        Row: {
          active: boolean;
          amount: number;
          category_id: string;
          created_at: string;
          day_of_month: number;
          description: string | null;
          id: string;
          start_month: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          amount: number;
          category_id: string;
          created_at?: string;
          day_of_month: number;
          description?: string | null;
          id?: string;
          start_month: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          amount?: number;
          category_id?: string;
          created_at?: string;
          day_of_month?: number;
          description?: string | null;
          id?: string;
          start_month?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'recurring_expenses_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      habit_logs: {
        Row: {
          completed: boolean;
          completed_at: string | null;
          date: string;
          habit_id: string;
          id: string;
          user_id: string;
        };
        Insert: {
          completed?: boolean;
          completed_at?: string | null;
          date: string;
          habit_id: string;
          id?: string;
          user_id: string;
        };
        Update: {
          completed?: boolean;
          completed_at?: string | null;
          date?: string;
          habit_id?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'habit_logs_habit_id_fkey';
            columns: ['habit_id'];
            isOneToOne: false;
            referencedRelation: 'habits';
            referencedColumns: ['id'];
          },
        ];
      };
      habits: {
        Row: {
          archived: boolean;
          created_at: string;
          frequency: string;
          icon: string | null;
          id: string;
          name: string;
          user_id: string;
        };
        Insert: {
          archived?: boolean;
          created_at?: string;
          frequency?: string;
          icon?: string | null;
          id?: string;
          name: string;
          user_id: string;
        };
        Update: {
          archived?: boolean;
          created_at?: string;
          frequency?: string;
          icon?: string | null;
          id?: string;
          name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          is_read: boolean;
          metadata: Json | null;
          read_at: string | null;
          title: string;
          type: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          metadata?: Json | null;
          read_at?: string | null;
          title: string;
          type: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          metadata?: Json | null;
          read_at?: string | null;
          title?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      otp_codes: {
        Row: {
          attempts: number;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          max_attempts: number;
          otp_hash: string;
          salt: string;
          verified_at: string | null;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          email: string;
          expires_at: string;
          id?: string;
          max_attempts?: number;
          otp_hash: string;
          salt: string;
          verified_at?: string | null;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          max_attempts?: number;
          otp_hash?: string;
          salt?: string;
          verified_at?: string | null;
        };
        Relationships: [];
      };
      password_reset_tokens: {
        Row: {
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          salt: string;
          token_hash: string;
          used_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          expires_at: string;
          id?: string;
          salt: string;
          token_hash: string;
          used_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          salt?: string;
          token_hash?: string;
          used_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      posts: {
        Row: {
          author_id: string;
          blog_visible: boolean;
          content: string | null;
          cover_image: string | null;
          created_at: string;
          featured: boolean;
          id: string;
          meta_desc: string | null;
          meta_title: string | null;
          published_at: string | null;
          publish_at: string | null;
          slug: string;
          status: Database['public']['Enums']['post_status'];
          title: string;
          updated_at: string;
          view_count: number;
        };
        Insert: {
          author_id: string;
          blog_visible?: boolean;
          content?: string | null;
          cover_image?: string | null;
          created_at?: string;
          featured?: boolean;
          id?: string;
          meta_desc?: string | null;
          meta_title?: string | null;
          published_at?: string | null;
          publish_at?: string | null;
          slug: string;
          status?: Database['public']['Enums']['post_status'];
          title: string;
          updated_at?: string;
          view_count?: number;
        };
        Update: {
          author_id?: string;
          blog_visible?: boolean;
          content?: string | null;
          cover_image?: string | null;
          created_at?: string;
          featured?: boolean;
          id?: string;
          meta_desc?: string | null;
          meta_title?: string | null;
          published_at?: string | null;
          publish_at?: string | null;
          slug?: string;
          status?: Database['public']['Enums']['post_status'];
          title?: string;
          updated_at?: string;
          view_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'posts_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      post_categories: {
        Row: {
          category_id: string;
          post_id: string;
        };
        Insert: {
          category_id: string;
          post_id: string;
        };
        Update: {
          category_id?: string;
          post_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'post_categories_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'blog_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'post_categories_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
        ];
      };
      post_tags: {
        Row: {
          post_id: string;
          tag_id: string;
        };
        Insert: {
          post_id: string;
          tag_id: string;
        };
        Update: {
          post_id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'post_tags_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'post_tags_tag_id_fkey';
            columns: ['tag_id'];
            isOneToOne: false;
            referencedRelation: 'blog_tags';
            referencedColumns: ['id'];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          p256dh: string;
          updated_at: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          p256dh: string;
          updated_at?: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          p256dh?: string;
          updated_at?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_subscriptions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      short_links: {
        Row: {
          code: string;
          created_at: string;
          expires_at: string | null;
          is_blocked: boolean;
          original_url: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          expires_at?: string | null;
          is_blocked?: boolean;
          original_url: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          expires_at?: string | null;
          is_blocked?: boolean;
          original_url?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      users: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          email: string;
          id: string;
          is_admin: boolean;
          name: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          email: string;
          id: string;
          is_admin?: boolean;
          name?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          is_admin?: boolean;
          name?: string | null;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          currency: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          currency?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          currency?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_settings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      generate_certificate_code: { Args: never; Returns: string };
      get_category_breakdown: {
        Args: {
          p_categories: string[] | null;
          p_end: string;
          p_start: string;
          p_user_id: string;
        };
        Returns: {
          category_id: string;
          color_hex: string;
          name: string;
          total: number;
        }[];
      };
      get_daily_totals: {
        Args: {
          p_categories: string[] | null;
          p_end: string;
          p_start: string;
          p_user_id: string;
        };
        Returns: {
          date: string;
          total: number;
        }[];
      };
      get_total_expenses: {
        Args: {
          p_categories: string[] | null;
          p_end: string;
          p_start: string;
          p_user_id: string;
        };
        Returns: number;
      };
      increment_post_view_count: { Args: { p_post_id: string }; Returns: undefined };
      increment_otp_attempts: { Args: { row_id: string }; Returns: number };
      is_admin: { Args: never; Returns: boolean };
      recompute_admin_flags: {
        Args: { p_emails: string[] };
        Returns: undefined;
      };
    };
    Enums: {
      post_status: 'draft' | 'published' | 'scheduled';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      post_status: ['draft', 'published'],
    },
  },
} as const;
