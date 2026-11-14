import { describe, expect, it } from "vitest";
import { mapRpcError } from "@/lib/supabase/rpc-errors";

describe("mapRpcError", () => {
  it("42501 (権限なし) -> 403", () => {
    const r = mapRpcError({ code: "42501", message: "forbidden" });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("forbidden");
  });

  it("P0002 (対象なし) -> 404", () => {
    expect(mapRpcError({ code: "P0002", message: "round not found" }).status).toBe(404);
  });

  it("22023 (不正な引数) -> 400", () => {
    expect(mapRpcError({ code: "22023", message: "x" }).status).toBe(400);
  });

  it("想定外のコードは 500 でメッセージを保持する", () => {
    const r = mapRpcError({ code: "XX000", message: "boom" });
    expect(r.status).toBe(500);
    expect(r.body.message).toBe("boom");
  });

  it("code が無い場合も 500", () => {
    expect(mapRpcError({ message: "network" }).status).toBe(500);
  });
});
