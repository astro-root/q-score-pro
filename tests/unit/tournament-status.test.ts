import { describe, expect, it } from "vitest";
import { canTransition } from "@/lib/tournament/status";

describe("tournament status transitions", () => {
  it("allows the normal forward flow", () => {
    expect(canTransition("DRAFT", "REGISTRATION_OPEN")).toBe(true);
    expect(canTransition("REGISTRATION_OPEN", "REGISTRATION_CLOSED")).toBe(true);
    expect(canTransition("REGISTRATION_CLOSED", "RUNNING")).toBe(true);
    expect(canTransition("RUNNING", "FINISHED")).toBe(true);
    expect(canTransition("FINISHED", "PUBLISHED")).toBe(true);
  });

  it("allows reopening entries before the tournament starts", () => {
    expect(canTransition("REGISTRATION_OPEN", "DRAFT")).toBe(true);
    expect(canTransition("REGISTRATION_CLOSED", "REGISTRATION_OPEN")).toBe(true);
  });

  it("rejects skipping states", () => {
    expect(canTransition("DRAFT", "RUNNING")).toBe(false);
    expect(canTransition("DRAFT", "PUBLISHED")).toBe(false);
    expect(canTransition("REGISTRATION_OPEN", "FINISHED")).toBe(false);
  });

  it("rejects moving backwards once running", () => {
    expect(canTransition("RUNNING", "REGISTRATION_OPEN")).toBe(false);
    expect(canTransition("FINISHED", "RUNNING")).toBe(false);
  });

  it("PUBLISHED is a terminal state", () => {
    expect(canTransition("PUBLISHED", "DRAFT")).toBe(false);
    expect(canTransition("PUBLISHED", "RUNNING")).toBe(false);
  });
});
