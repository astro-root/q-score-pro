/**
 * アプリで使う Database 型。
 *
 * - 土台は `database.generated.ts`(supabase gen types の出力。テーブル・カラム・enum・RPC)。
 *   スキーマ(マイグレーション)を変えたら `bash scripts/gen-types.sh` で再生成する。
 * - このファイルは、生成型だけでは表せないアプリ固有の情報を重ねる:
 *     1. jsonb カラムの中身の型 (answers / rule_config / metadata / data / options)
 *     2. 追記専用テーブルの更新制限 (audit_logs は更新不可、score_events は取消のみ)
 *     3. RPC の引数 (null を受け付ける引数、jsonb を渡す引数)
 * - enum は生成型から別名を作る。スキーマと型がずれないようにするため。
 */
import type { RuleConfig, ScoreEventType } from "@/lib/rules/types";
import type { DisplayLayoutData } from "@/lib/display/types";
import type { Database as Generated } from "./database.generated";

export type { Json } from "./database.generated";

type PublicSchema = Generated["public"];
type Enums = PublicSchema["Enums"];
type Tables = PublicSchema["Tables"];
type Functions = PublicSchema["Functions"];

export type TournamentStatus = Enums["tournament_status"];
export type TournamentMemberRole = Enums["tournament_member_role"];
export type EntryFieldType = Enums["entry_field_type"];
export type EntryStatus = Enums["entry_status"];
export type ParticipantStatus = Enums["participant_status"];
export type RoundType = Enums["round_type"];
export type RoundStatus = Enums["round_status"];

/** entries.answers: 入力フォームの項目キー → 回答 */
export type EntryAnswers = Record<string, string | number | boolean | null>;

type Override<T, O> = Omit<T, keyof O> & O;

type TableShape = { Row: object; Insert: object; Update: object };

/** jsonb カラム1つの型を差し替える (Row は必須、Insert/Update は任意) */
type WithColumn<T extends TableShape, Col extends string, V> = Override<
  T,
  {
    Row: Override<T["Row"], Record<Col, V>>;
    Insert: Override<T["Insert"], Partial<Record<Col, V>>>;
    Update: Override<T["Update"], Partial<Record<Col, V>>>;
  }
>;

/** RPC の引数の型を差し替える */
type WithArgs<F extends { Args: object }, A> = Override<F, { Args: Override<F["Args"], A> }>;

export type Database = Override<
  Generated,
  {
    public: Override<
      PublicSchema,
      {
        Tables: Override<
          Tables,
          {
            entries: WithColumn<Tables["entries"], "answers", EntryAnswers>;
            entry_form_fields: WithColumn<Tables["entry_form_fields"], "options", string[] | null>;
            rounds: WithColumn<Tables["rounds"], "rule_config", RuleConfig>;
            display_layouts: WithColumn<Tables["display_layouts"], "data", DisplayLayoutData>;
            // 監査ログは追記専用: 更新は一切できない
            audit_logs: Override<
              WithColumn<Tables["audit_logs"], "metadata", Record<string, unknown>>,
              { Update: Record<string, never> }
            >;
            // イベントログは追記専用: 更新できるのは「取消」の記録だけ
            score_events: Override<
              Tables["score_events"],
              { Update: Partial<Pick<Tables["score_events"]["Row"], "voided_at" | "voided_by">> }
            >;
          }
        >;
        // 型生成は「DEFAULT つきの引数が null を受け付けること」を表せない。
        // 実際の関数は null を受け付けるので(例: p_value numeric default null)、ここで補う。
        // p_rows は jsonb だが、呼び出し側の行オブジェクト(interface)をそのまま渡すため unknown とする。
        Functions: Override<
          Functions,
          {
            record_score_event: WithArgs<Functions["record_score_event"], { p_value?: number | null }>;
            change_tournament_status: WithArgs<
              Functions["change_tournament_status"],
              { p_status: TournamentStatus; p_reason?: string | null }
            >;
            apply_round_computation: WithArgs<Functions["apply_round_computation"], { p_rows: unknown }>;
            // p_answers は呼び出し側の配列をそのまま渡す(jsonb)
            submit_paper_answers: WithArgs<Functions["submit_paper_answers"], { p_answers: unknown }>;
          }
        >;
      }
    >;
  }
>;

// ---------------------------------------------------------------------------
// スキーマとアプリの型がずれたら、ここでコンパイルエラーになる。
// (アプリ側の ScoreEventType と DB の enum score_event_type の一致)
// ---------------------------------------------------------------------------
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type _ScoreEventTypeMatchesDb = Assert<Equal<ScoreEventType, Enums["score_event_type"]>>;
