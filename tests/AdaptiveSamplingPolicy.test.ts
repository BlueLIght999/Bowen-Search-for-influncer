import { describe, expect, it } from "vitest";
import { createAdaptiveSamplingPlan } from "../src/domain/multimodalIntelligence/AdaptiveSamplingPolicy";

describe("createAdaptiveSamplingPlan", () => {
  it("samples the opening and ending more densely than the middle", () => {
    const plan = createAdaptiveSamplingPlan({
      durationSeconds: 30
    });

    const opening = plan.filter((point) => point.reason === "opening");
    const middle = plan.filter((point) => point.reason === "interval");
    const ending = plan.filter((point) => point.reason === "ending");

    expect(opening.length).toBeGreaterThanOrEqual(10);
    expect(ending.length).toBeGreaterThanOrEqual(10);
    expect(middle.length).toBeGreaterThan(0);
    expect(opening.at(1)!.timestampSeconds - opening[0].timestampSeconds).toBe(
      0.5
    );
    expect(
      middle.at(1)!.timestampSeconds - middle[0].timestampSeconds
    ).toBeGreaterThanOrEqual(3);
  });

  it("adds evidence points around detected scene boundaries", () => {
    const plan = createAdaptiveSamplingPlan({
      durationSeconds: 30,
      sceneBoundariesSeconds: [12]
    });

    expect(
      plan
        .filter((point) => point.reason === "scene_change")
        .map((point) => point.timestampSeconds)
    ).toEqual([11.75, 12, 12.25]);
  });

  it("deduplicates overlapping sampling points and keeps them ordered", () => {
    const plan = createAdaptiveSamplingPlan({
      durationSeconds: 10,
      sceneBoundariesSeconds: [0.5, 9.5]
    });
    const timestamps = plan.map((point) => point.timestampSeconds);

    expect(timestamps).toEqual([...timestamps].sort((left, right) => left - right));
    expect(new Set(timestamps).size).toBe(timestamps.length);
  });

  it("enforces the hard cap while preserving the first and final moments", () => {
    const plan = createAdaptiveSamplingPlan({
      durationSeconds: 300,
      sceneBoundariesSeconds: Array.from(
        { length: 100 },
        (_, index) => 10 + index * 2
      ),
      maxFrames: 80
    });

    expect(plan).toHaveLength(80);
    expect(plan[0].timestampSeconds).toBe(0);
    expect(plan.at(-1)!.timestampSeconds).toBeCloseTo(299.95, 2);
    expect(
      plan.some(
        (point) =>
          point.reason === "scene_change" &&
          point.timestampSeconds >= 100 &&
          point.timestampSeconds <= 200
      )
    ).toBe(true);
  });

  it("rejects invalid duration and scene boundaries", () => {
    expect(() =>
      createAdaptiveSamplingPlan({ durationSeconds: 0 })
    ).toThrow("Video duration must be a positive finite number.");
    expect(() =>
      createAdaptiveSamplingPlan({
        durationSeconds: 30,
        sceneBoundariesSeconds: [31]
      })
    ).toThrow("Scene boundary must be within the video duration: 31");
  });
});
