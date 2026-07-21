import { describe, expect, it, vi } from "vitest";
import { generateRoomCode, sanitizeRoomCode } from "../src/lib/roomCode";

describe("room code helpers", () => {
  it("generates a four-character code from the approved alphabet", () => {
    const code = generateRoomCode(vi.fn(() => 0));
    expect(code).toHaveLength(4);
    expect(code).toBe("AAAA");
  });

  it("sanitizes and uppercases join codes", () => {
    expect(sanitizeRoomCode("ab-7k!")).toBe("AB7K");
  });
});
