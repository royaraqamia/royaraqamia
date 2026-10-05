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
      availability_slots: {
        Row: {
          created_at: string;
          ends_at: string;
          id: string;
          starts_at: string;
        };
        Insert: {
          created_at?: string;
          ends_at: string;
          id?: string;
          starts_at: string;
        };
        Update: {
          created_at?: string;
          ends_at?: string;
          id?: string;
          starts_at?: string;
        };
        Relationships: [];
      };
      community_categories: {
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
      community_tags: {
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
            foreignKeyName: 'budgets_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
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
          created_by: string | null;
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
          created_by?: string | null;
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
          created_by?: string | null;
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
      consultation_booking_slots: {
        Row: {
          booking_id: string;
          is_active: boolean;
          slot_id: string;
        };
        Insert: {
          booking_id: string;
          is_active?: boolean;
          slot_id: string;
        };
        Update: {
          booking_id?: string;
          is_active?: boolean;
          slot_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'consultation_booking_slots_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'consultation_bookings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'consultation_booking_slots_slot_id_fkey';
            columns: ['slot_id'];
            isOneToOne: false;
            referencedRelation: 'availability_slots';
            referencedColumns: ['id'];
          },
        ];
      };
      consultation_bookings: {
        Row: {
          confirmed_at: string | null;
          created_at: string;
          edited_at: string | null;
          email: string | null;
          full_name: string;
          id: string;
          package_id: string;
          phone_whatsapp: string;
          reference_code: string;
          rejected_reason: string | null;
          status: string;
          topic_description: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          confirmed_at?: string | null;
          created_at?: string;
          edited_at?: string | null;
          email?: string | null;
          full_name: string;
          id?: string;
          package_id: string;
          phone_whatsapp: string;
          reference_code: string;
          rejected_reason?: string | null;
          status?: string;
          topic_description: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          confirmed_at?: string | null;
          created_at?: string;
          edited_at?: string | null;
          email?: string | null;
          full_name?: string;
          id?: string;
          package_id?: string;
          phone_whatsapp?: string;
          reference_code?: string;
          rejected_reason?: string | null;
          status?: string;
          topic_description?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'consultation_bookings_package_id_fkey';
            columns: ['package_id'];
            isOneToOne: false;
            referencedRelation: 'consultation_packages';
            referencedColumns: ['id'];
          },
        ];
      };
      consultation_packages: {
        Row: {
          created_at: string;
          description: string | null;
          duration_minutes: number;
          id: string;
          is_active: boolean;
          name: string;
          price_usd: number;
          sessions_count: number;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          duration_minutes: number;
          id?: string;
          is_active?: boolean;
          name: string;
          price_usd: number;
          sessions_count?: number;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          is_active?: boolean;
          name?: string;
          price_usd?: number;
          sessions_count?: number;
          sort_order?: number;
        };
        Relationships: [];
      };
      consultation_settings: {
        Row: {
          key: string;
          updated_at: string;
          value: string;
        };
        Insert: {
          key: string;
          updated_at?: string;
          value: string;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: string;
        };
        Relationships: [];
      };
      expense_splits: {
        Row: {
          amount: number;
          category_id: string;
          created_at: string;
          expense_id: string;
          id: string;
        };
        Insert: {
          amount: number;
          category_id: string;
          created_at?: string;
          expense_id: string;
          id?: string;
        };
        Update: {
          amount?: number;
          category_id?: string;
          created_at?: string;
          expense_id?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'expense_splits_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expense_splits_expense_id_fkey';
            columns: ['expense_id'];
            isOneToOne: false;
            referencedRelation: 'expenses';
            referencedColumns: ['id'];
          },
        ];
      };
      expenses: {
        Row: {
          amount: number;
          category_id: string;
          created_at: string;
          currency: string | null;
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
          currency?: string | null;
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
          currency?: string | null;
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
      habit_logs: {
        Row: {
          completed: boolean;
          completed_at: string | null;
          date: string;
          habit_id: string;
          id: string;
          log_kind: string;
          note: string | null;
          user_id: string;
        };
        Insert: {
          completed?: boolean;
          completed_at?: string | null;
          date: string;
          habit_id: string;
          id?: string;
          log_kind?: string;
          note?: string | null;
          user_id: string;
        };
        Update: {
          completed?: boolean;
          completed_at?: string | null;
          date?: string;
          habit_id?: string;
          id?: string;
          log_kind?: string;
          note?: string | null;
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
          id: string;
          name: string;
          reminder_time: string | null;
          target: number | null;
          target_period: string | null;
          user_id: string;
        };
        Insert: {
          archived?: boolean;
          created_at?: string;
          frequency?: string;
          id?: string;
          name: string;
          reminder_time?: string | null;
          target?: number | null;
          target_period?: string | null;
          user_id: string;
        };
        Update: {
          archived?: boolean;
          created_at?: string;
          frequency?: string;
          id?: string;
          name?: string;
          reminder_time?: string | null;
          target?: number | null;
          target_period?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      mcp_oauth_auth_codes: {
        Row: {
          challenge_method: string;
          client_id: string;
          code_challenge: string;
          code_hash: string;
          created_at: string;
          expires_at: string;
          id: string;
          redirect_uri: string;
          scope: Json;
          session_enc: string | null;
          used_at: string | null;
          user_id: string;
        };
        Insert: {
          challenge_method?: string;
          client_id: string;
          code_challenge: string;
          code_hash: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          redirect_uri: string;
          scope?: Json;
          session_enc?: string | null;
          used_at?: string | null;
          user_id: string;
        };
        Update: {
          challenge_method?: string;
          client_id?: string;
          code_challenge?: string;
          code_hash?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          redirect_uri?: string;
          scope?: Json;
          session_enc?: string | null;
          used_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      mcp_oauth_clients: {
        Row: {
          client_id: string;
          client_name: string | null;
          client_secret_hash: string | null;
          created_at: string;
          expires_at: string | null;
          id: string;
          redirect_uris: Json;
          registration_token_hash: string | null;
          scopes: Json;
        };
        Insert: {
          client_id: string;
          client_name?: string | null;
          client_secret_hash?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          redirect_uris?: Json;
          registration_token_hash?: string | null;
          scopes?: Json;
        };
        Update: {
          client_id?: string;
          client_name?: string | null;
          client_secret_hash?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          redirect_uris?: Json;
          registration_token_hash?: string | null;
          scopes?: Json;
        };
        Relationships: [];
      };
      mcp_oauth_tokens: {
        Row: {
          client_id: string;
          created_at: string;
          expires_at: string;
          id: string;
          kind: string;
          last_used_at: string | null;
          refresh_token_hash: string | null;
          revoked_at: string | null;
          scope: Json;
          session_enc: string | null;
          token_hash: string;
          user_id: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          kind: string;
          last_used_at?: string | null;
          refresh_token_hash?: string | null;
          revoked_at?: string | null;
          scope?: Json;
          session_enc?: string | null;
          token_hash: string;
          user_id: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          kind?: string;
          last_used_at?: string | null;
          refresh_token_hash?: string | null;
          revoked_at?: string | null;
          scope?: Json;
          session_enc?: string | null;
          token_hash?: string;
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
            referencedRelation: 'community_categories';
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
            referencedRelation: 'community_tags';
            referencedColumns: ['id'];
          },
        ];
      };
      posts: {
        Row: {
          author_id: string;
          community_visible: boolean;
          content: string | null;
          cover_image: string | null;
          created_at: string;
          featured: boolean;
          id: string;
          meta_desc: string | null;
          meta_title: string | null;
          publish_at: string | null;
          published_at: string | null;
          reading_time_minutes: number;
          slug: string;
          status: Database['public']['Enums']['post_status'];
          title: string;
          updated_at: string;
          view_count: number;
        };
        Insert: {
          author_id: string;
          community_visible?: boolean;
          content?: string | null;
          cover_image?: string | null;
          created_at?: string;
          featured?: boolean;
          id?: string;
          meta_desc?: string | null;
          meta_title?: string | null;
          publish_at?: string | null;
          published_at?: string | null;
          reading_time_minutes?: number;
          slug: string;
          status?: Database['public']['Enums']['post_status'];
          title: string;
          updated_at?: string;
          view_count?: number;
        };
        Update: {
          author_id?: string;
          community_visible?: boolean;
          content?: string | null;
          cover_image?: string | null;
          created_at?: string;
          featured?: boolean;
          id?: string;
          meta_desc?: string | null;
          meta_title?: string | null;
          publish_at?: string | null;
          published_at?: string | null;
          reading_time_minutes?: number;
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
      project_requests: {
        Row: {
          budget_range: string | null;
          created_at: string;
          description: string;
          edited_at: string | null;
          email: string | null;
          existing_url: string | null;
          full_name: string;
          id: string;
          notes: string | null;
          phone_whatsapp: string;
          project_type: string;
          reference_code: string;
          status: string;
          timeline: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          budget_range?: string | null;
          created_at?: string;
          description: string;
          edited_at?: string | null;
          email?: string | null;
          existing_url?: string | null;
          full_name: string;
          id?: string;
          notes?: string | null;
          phone_whatsapp: string;
          project_type: string;
          reference_code: string;
          status?: string;
          timeline?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          budget_range?: string | null;
          created_at?: string;
          description?: string;
          edited_at?: string | null;
          email?: string | null;
          existing_url?: string | null;
          full_name?: string;
          id?: string;
          notes?: string | null;
          phone_whatsapp?: string;
          project_type?: string;
          reference_code?: string;
          status?: string;
          timeline?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
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
        Relationships: [];
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
      rate_snapshots: {
        Row: {
          base_currency: string;
          created_at: string;
          fetched_at: string;
          id: string;
          metals: Json;
          official_rates: Json;
          parallel_rates: Json;
          provider_quote_date: string;
          rates: Json;
        };
        Insert: {
          base_currency?: string;
          created_at?: string;
          fetched_at?: string;
          id?: string;
          metals?: Json;
          official_rates?: Json;
          parallel_rates?: Json;
          provider_quote_date: string;
          rates?: Json;
        };
        Update: {
          base_currency?: string;
          created_at?: string;
          fetched_at?: string;
          id?: string;
          metals?: Json;
          official_rates?: Json;
          parallel_rates?: Json;
          provider_quote_date?: string;
          rates?: Json;
        };
        Relationships: [];
      };
      rate_sync_runs: {
        Row: {
          currency_count: number;
          error: string | null;
          finished_at: string | null;
          id: string;
          metal_count: number;
          provider: string;
          provider_quote_date: string | null;
          snapshot_id: string | null;
          started_at: string;
          status: string;
        };
        Insert: {
          currency_count?: number;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          metal_count?: number;
          provider?: string;
          provider_quote_date?: string | null;
          snapshot_id?: string | null;
          started_at?: string;
          status?: string;
        };
        Update: {
          currency_count?: number;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          metal_count?: number;
          provider?: string;
          provider_quote_date?: string | null;
          snapshot_id?: string | null;
          started_at?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rate_sync_runs_snapshot_id_fkey';
            columns: ['snapshot_id'];
            isOneToOne: false;
            referencedRelation: 'rate_snapshots';
            referencedColumns: ['id'];
          },
        ];
      };
      retainers: {
        Row: {
          company: string | null;
          created_at: string;
          current_projects: string;
          edited_at: string | null;
          email: string | null;
          full_name: string;
          id: string;
          monthly_fee_usd: number;
          needs: string;
          notes: string | null;
          paid_through: string | null;
          phone_whatsapp: string;
          preferred_start: string | null;
          reference_code: string;
          status: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          company?: string | null;
          created_at?: string;
          current_projects: string;
          edited_at?: string | null;
          email?: string | null;
          full_name: string;
          id?: string;
          monthly_fee_usd?: number;
          needs: string;
          notes?: string | null;
          paid_through?: string | null;
          phone_whatsapp: string;
          preferred_start?: string | null;
          reference_code: string;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          company?: string | null;
          created_at?: string;
          current_projects?: string;
          edited_at?: string | null;
          email?: string | null;
          full_name?: string;
          id?: string;
          monthly_fee_usd?: number;
          needs?: string;
          notes?: string | null;
          paid_through?: string | null;
          phone_whatsapp?: string;
          preferred_start?: string | null;
          reference_code?: string;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      short_links: {
        Row: {
          code: string;
          created_at: string;
          expires_at: string | null;
          is_blocked: boolean;
          original_url: string;
          password_hash: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          expires_at?: string | null;
          is_blocked?: boolean;
          original_url: string;
          password_hash?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          expires_at?: string | null;
          is_blocked?: boolean;
          original_url?: string;
          password_hash?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      training_applications: {
        Row: {
          cohort_id: string | null;
          course_slug: string;
          created_at: string;
          edited_at: string | null;
          full_name: string;
          goal: string | null;
          id: string;
          notes: string | null;
          phone_whatsapp: string;
          reference_code: string;
          status: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          cohort_id?: string | null;
          course_slug: string;
          created_at?: string;
          edited_at?: string | null;
          full_name: string;
          goal?: string | null;
          id?: string;
          notes?: string | null;
          phone_whatsapp: string;
          reference_code: string;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          cohort_id?: string | null;
          course_slug?: string;
          created_at?: string;
          edited_at?: string | null;
          full_name?: string;
          goal?: string | null;
          id?: string;
          notes?: string | null;
          phone_whatsapp?: string;
          reference_code?: string;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'training_applications_cohort_id_fkey';
            columns: ['cohort_id'];
            isOneToOne: false;
            referencedRelation: 'training_cohorts';
            referencedColumns: ['id'];
          },
        ];
      };
      training_cohorts: {
        Row: {
          capacity: number;
          course_slug: string;
          created_at: string;
          id: string;
          label: string;
          seats_taken: number;
          starts_at: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          capacity: number;
          course_slug: string;
          created_at?: string;
          id?: string;
          label: string;
          seats_taken?: number;
          starts_at: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          capacity?: number;
          course_slug?: string;
          created_at?: string;
          id?: string;
          label?: string;
          seats_taken?: number;
          starts_at?: string;
          status?: string;
          updated_at?: string;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_consultation_booking: {
        Args: {
          p_email?: string;
          p_full_name?: string;
          p_package_id?: string;
          p_phone_whatsapp?: string;
          p_reference_code?: string;
          p_slot_ids?: string[];
          p_topic_description?: string;
          p_user_id?: string;
        };
        Returns: string;
      };
      enroll_application: {
        Args: { p_application_id: string; p_cohort_id: string };
        Returns: string;
      };
      generate_certificate_code: { Args: never; Returns: string };
      get_auth_user_by_email: {
        Args: { p_email: string };
        Returns: {
          email: string;
          email_confirmed_at: string | null;
          id: string;
        }[];
      };
      get_category_breakdown: {
        Args: {
          p_categories?: string[];
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
          p_categories?: string[];
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
          p_categories?: string[];
          p_end: string;
          p_start: string;
          p_user_id: string;
        };
        Returns: number;
      };
      increment_otp_attempts: { Args: { row_id: string }; Returns: number };
      increment_post_view_count: {
        Args: { p_post_id: string };
        Returns: undefined;
      };
      is_admin: { Args: never; Returns: boolean };
      list_available_consultation_slots: {
        Args: { p_now: string };
        Returns: {
          ends_at: string;
          slot_id: string;
          starts_at: string;
        }[];
      };
      materialize_due_recurring_expenses: { Args: never; Returns: boolean };
      recompute_admin_flags: {
        Args: { p_emails: string[] };
        Returns: undefined;
      };
      release_application: {
        Args: { p_application_id: string; p_status: string };
        Returns: string;
      };
      reschedule_consultation_booking: {
        Args: {
          p_booking_id: string;
          p_user_id: string;
          p_package_id: string;
          p_slot_ids: string[];
        };
        Returns: undefined;
      };
      send_daily_habit_reminders: { Args: never; Returns: undefined };
      send_recovery_nudges: { Args: never; Returns: undefined };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { '': string }; Returns: string[] };
      sweep_expired_mcp_oauth_tokens: { Args: never; Returns: undefined };
      sweep_stale_push_subscriptions: { Args: never; Returns: undefined };
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
      post_status: ['draft', 'published', 'scheduled'],
    },
  },
} as const;
