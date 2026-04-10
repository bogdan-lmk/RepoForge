import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGetFeaturedCombos } = vi.hoisted(() => ({
  mockGetFeaturedCombos: vi.fn(),
}));

vi.mock("@/lib/featured-combos", () => ({
  getFeaturedCombos: (...args: unknown[]) => mockGetFeaturedCombos(...args),
}));

import { GET } from "#/app/api/combos/featured/route";

describe("GET /api/combos/featured", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFeaturedCombos.mockResolvedValue([
      {
        id: 1,
        title: "Agent Console",
        thesis: "Turn open-source repos into an ops console.",
      },
    ]);
  });

  it("returns featured combos with the default limit", async () => {
    const req = new NextRequest("http://localhost/api/combos/featured");

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      data: [
        {
          id: 1,
          title: "Agent Console",
          thesis: "Turn open-source repos into an ops console.",
        },
      ],
    });
    expect(mockGetFeaturedCombos).toHaveBeenCalledWith(3);
  });

  it("clamps the requested limit", async () => {
    const req = new NextRequest("http://localhost/api/combos/featured?limit=99");

    await GET(req);

    expect(mockGetFeaturedCombos).toHaveBeenCalledWith(6);
  });
});
