// スタッフに付与できるロールの表示名 (OWNER は付与不可なので含めない)
export const ROLE_OPTIONS = [
  { value: "ADMIN", label: "大会管理者" },
  { value: "QUESTION_MANAGER", label: "問題管理者" },
  { value: "SCORE_OPERATOR", label: "得点オペレーター" },
  { value: "GRADER", label: "採点担当" },
  { value: "STREAM_OPERATOR", label: "配信担当" },
  { value: "VENUE_STAFF", label: "会場スタッフ" },
  { value: "VIEWER", label: "閲覧専用" },
] as const;
