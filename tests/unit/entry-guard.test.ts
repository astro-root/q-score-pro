import { describe, expect, it } from "vitest";
import { mapEntryInsertError } from "@/lib/entries/guard";

describe("mapEntryInsertError (R-05)", () => {
  it("重複(23505)は 409 entry_duplicate", () => {
    const r = mapEntryInsertError({ code: "23505", message: "entry_duplicate" });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("entry_duplicate");
    expect(r.body.message).toContain("既にエントリー済み");
  });

  it("コードが落ちてもメッセージで重複を判定できる", () => {
    expect(mapEntryInsertError({ message: "entry_duplicate" }).status).toBe(409);
  });

  it("受付上限(QS429)は 429 で Retry-After を返す", () => {
    const r = mapEntryInsertError({ code: "QS429", message: "entry_rate_limited" });
    expect(r.status).toBe(429);
    expect(r.headers?.["Retry-After"]).toBe("60");
    expect(r.body.error).toBe("entry_rate_limited");
  });

  it("RLS違反(受付中ではない)は 409 entries_closed", () => {
    const r = mapEntryInsertError({
      code: "42501",
      message: 'new row violates row-level security policy for table "entries"',
    });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("entries_closed");
  });

  it("想定外のエラーは 500 でメッセージをそのまま返す", () => {
    const r = mapEntryInsertError({ code: "XX000", message: "boom" });
    expect(r).toEqual({ status: 500, body: { error: "boom" } });
  });
});
