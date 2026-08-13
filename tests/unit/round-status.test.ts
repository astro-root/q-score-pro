import { describe, expect, it } from "vitest";
import { canTransitionRound } from "@/lib/tournament/round-status";

describe("round status transitions", () => {
  it("allows starting a round", () => {
    expect(canTransitionRound("NOT_STARTED", "RUNNING")).toBe(true);
  });

  it("allows pausing and resuming", () => {
    expect(canTransitionRound("RUNNING", "PAUSED")).toBe(true);
    expect(canTransitionRound("PAUSED", "RUNNING")).toBe(true);
  });

  it("allows finishing from RUNNING", () => {
    expect(canTransitionRound("RUNNING", "FINISHED")).toBe(true);
  });

  it("rejects finishing directly from NOT_STARTED", () => {
    expect(canTransitionRound("NOT_STARTED", "FINISHED")).toBe(false);
  });

  it("rejects any transition out of FINISHED", () => {
    expect(canTransitionRound("FINISHED", "RUNNING")).toBe(false);
    expect(canTransitionRound("FINISHED", "NOT_STARTED")).toBe(false);
  });

  it("rejects skipping back to NOT_STARTED once running", () => {
    expect(canTransitionRound("RUNNING", "NOT_STARTED")).toBe(false);
    expect(canTransitionRound("PAUSED", "NOT_STARTED")).toBe(false);
  });
});
