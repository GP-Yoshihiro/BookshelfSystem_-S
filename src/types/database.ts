/**
 * Supabase スキーマと 1:1 で対応する型定義。
 * supabase/migrations/0001_initial_schema.sql の変更時は本ファイルも更新すること。
 */

import type { InviteCodeStatus } from '@/features/auth/messages';

export type UserRole = 'admin' | 'user';

export type BookCategory =
  | 'tankobon'
  | 'series_tankobon'
  | 'light_novel'
  | 'comic';

/** 連載中フラグを保持できる分類（単行本以外） */
export const ONGOING_CAPABLE_CATEGORIES: readonly BookCategory[] = [
  'series_tankobon',
  'light_novel',
  'comic',
] as const;

/** 分類の日本語ラベル */
export const BOOK_CATEGORY_LABELS: Readonly<Record<BookCategory, string>> = {
  tankobon: '単行本',
  series_tankobon: 'シリーズ単行本',
  light_novel: 'ライトノベル',
  comic: 'コミック',
};

export interface Profile {
  id: string;
  display_name: string;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface InviteCode {
  id: string;
  code: string;
  created_by: string;
  used_by: string | null;
  is_used: boolean;
  used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface Book {
  id: string;
  user_id: string;
  isbn: string;
  title: string;
  title_kana: string | null;
  author: string;
  publisher: string;
  category: BookCategory;
  is_ongoing: boolean;
  cover_image_url: string | null;
  description: string | null;
  is_purchased: boolean;
  purchased_at: string | null;
  /** ISO 8601 の日付 (YYYY-MM-DD) */
  latest_release_date: string | null;
  item_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarReservation {
  id: string;
  user_id: string;
  book_id: string;
  /** ISO 8601 の日付 (YYYY-MM-DD) */
  scheduled_release_date: string;
  note: string | null;
  created_at: string;
}

/** DB のデフォルト値・トリガで自動採番される列 */
type GeneratedColumns = 'id' | 'created_at' | 'updated_at';

export type BookInsert = Omit<Book, GeneratedColumns> &
  Partial<Pick<Book, 'id'>>;
export type BookUpdate = Partial<Omit<Book, 'id' | 'user_id' | GeneratedColumns>>;

export type CalendarReservationInsert = Omit<
  CalendarReservation,
  'id' | 'created_at'
> &
  Partial<Pick<CalendarReservation, 'id'>>;

export type ProfileUpdate = Partial<
  Pick<Profile, 'display_name' | 'avatar_url'>
>;

/**
 * @supabase/supabase-js のジェネリクスへ渡すスキーマ定義。
 */
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Profile;
        Update: ProfileUpdate;
        Relationships: [];
      };
      invite_codes: {
        Row: InviteCode;
        Insert: Omit<InviteCode, 'id' | 'created_at'>;
        Update: Partial<Omit<InviteCode, 'id' | 'created_at'>>;
        Relationships: [];
      };
      books: {
        Row: Book;
        Insert: BookInsert;
        Update: BookUpdate;
        Relationships: [];
      };
      calendar_reservations: {
        Row: CalendarReservation;
        Insert: CalendarReservationInsert;
        Update: Partial<Omit<CalendarReservation, 'id' | 'created_at'>>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      has_any_user: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      generate_invite_code: {
        Args: { p_expires_in_days?: number | null };
        Returns: InviteCode;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      validate_invite_code: {
        Args: { p_code: string };
        Returns: InviteCodeStatus;
      };
    };
    Enums: {
      user_role: UserRole;
      book_category: BookCategory;
    };
    CompositeTypes: Record<never, never>;
  };
}
