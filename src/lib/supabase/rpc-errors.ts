/**
 * Postgres 関数 (RPC) が返したエラーを HTTP ステータスに対応づける。
 *
 * supabase/migrations/0010_role_scoped_rls_and_score_rpc.sql の関数は
 * 次の SQLSTATE で失敗を表す:
 *   42501 : 権限なし (ロール不足 / 大会のスタッフではない)
 *   P0002 : 対象が存在しない (ラウンドが見つからない等)
 *   22023 : 引数が不正 (他大会の参加者 / 不正な direction 等)
 * それ以外は想定外のエラーとして 500 にする。
 */
export interface RpcErrorLike {
  message: string;
  code?: string | null;
}

export interface MappedRpcError {
  status: number;
  body: { error: string; message: string };
}

export function mapRpcError(error: RpcErrorLike): MappedRpcError {
  switch (error.code) {
    case "42501":
      return {
        status: 403,
        body: { error: "forbidden", message: "この操作を行う権限がありません" },
      };
    case "P0002":
      return {
        status: 404,
        body: { error: "not_found", message: "対象のラウンドまたは参加者が見つかりません" },
      };
    case "22023":
      return {
        status: 400,
        body: { error: "invalid_input", message: "指定が正しくありません(他の大会の参加者など)" },
      };
    default:
      return { status: 500, body: { error: "internal_error", message: error.message } };
  }
}
