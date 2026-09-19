/**
 * Supabase スキーマと 1:1 で対応する型定義。
 * supabase/migrations/ の変更時は本ファイルも更新すること。
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

// NOTE: Row/Insert/Update は Supabase 側の GenericTable 制約
// （Record<string, unknown> への構造的代入）を満たす必要があるため、
// `interface` ではなく `type` で定義すること。
// `interface` のまま Tables に渡すと Schema 全体の型推論が崩れ、
// supabase.rpc() に引数を渡す呼び出しが軒並み型エラーになる
// （引数なしの呼び出しでは表面化しないため見落としやすい）。
export type Profile = {
  id: string;
  display_name: string;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type InviteCode = {
  id: string;
  code: string;
  created_by: string;
  used_by: string | null;
  is_used: boolean;
  used_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export type Book = {
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
  release_date_text: string | null;
  item_url: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * 発売日アラート。作品（シリーズ）単位で登録し、最新巻の発売日を
 * カレンダーへ載せる。本棚 (books) とは一切紐づかない。
 *
 * 旧 calendar_reservations は book_id で books を参照していたため、
 * まだ本棚に存在しない未発売の巻を扱えず、0007 で削除した。
 */
export type ReleaseAlert = {
  id: string;
  user_id: string;
  /** 作品の同一性を判定する鍵 */
  series_key: string;
  series_title: string;
  latest_volume: number | null;
  latest_title: string;
  latest_isbn: string;
  /** ISO 8601 の日付 (YYYY-MM-DD)。確定した発売日のみ */
  latest_release_date: string | null;
  /** 「2026年秋」のような確定できない表記の原文 */
  latest_release_date_text: string | null;
  cover_image_url: string | null;
  /** 楽天へ最後に問い合わせた時刻 */
  checked_at: string;
  created_at: string;
  updated_at: string;
};

/** DB のデフォルト値・トリガで自動採番される列 */
type GeneratedColumns = 'id' | 'created_at' | 'updated_at';

export type BookInsert = Omit<Book, GeneratedColumns> &
  Partial<Pick<Book, 'id'>>;
export type BookUpdate = Partial<Omit<Book, 'id' | 'user_id' | GeneratedColumns>>;

export type ReleaseAlertInsert = Omit<
  ReleaseAlert,
  GeneratedColumns | 'checked_at'
> &
  Partial<Pick<ReleaseAlert, 'id' | 'checked_at'>>;
export type ReleaseAlertUpdate = Partial<
  Omit<ReleaseAlert, 'id' | 'user_id' | 'series_key' | GeneratedColumns>
>;

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
      release_alerts: {
        Row: ReleaseAlert;
        Insert: ReleaseAlertInsert;
        Update: ReleaseAlertUpdate;
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
