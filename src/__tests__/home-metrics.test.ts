import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/db", async () => {
  const schema = await vi.importActual<typeof import("@/db/schema")>("@/db/schema");

  return {
    ...schema,
    db: {
      select: mockSelect,
    },
  };
});

import { logger } from "@/lib/logger";
import { getHomeMetrics } from "@/lib/home-metrics";

describe("home metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns counts and p50 latency from the database", async () => {
    mockSelect
      .mockImplementationOnce(() => ({ from: vi.fn().mockResolvedValueOnce([{ count: 321 }]) }))
      .mockImplementationOnce(() => ({ from: vi.fn().mockResolvedValueOnce([{ count: 654 }]) }))
      .mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValueOnce([{ p50: 187.4 }]),
        }),
      }));

    const metrics = await getHomeMetrics();

    expect(metrics).toEqual({
      repoCount: 321,
      comboCount: 654,
      p50LatencyMs: 187.4,
    });
  });

  it("falls back to null metrics when querying fails", async () => {
    mockSelect.mockImplementation(() => {
      throw new Error("db exploded");
    });

    const metrics = await getHomeMetrics();

    expect(metrics).toEqual({
      repoCount: null,
      comboCount: null,
      p50LatencyMs: null,
    });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
