import { beforeEach, describe, expect, it } from "vitest";
import { mockApi } from "../src/lib/mockApi";

describe("mock api", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("creates and starts a room", () => {
    const created = mockApi.createGame("JT", "Test Game");
    expect(created.roomCode).toHaveLength(4);

    const session = mockApi.getSession();
    localStorage.setItem("wagth:session", JSON.stringify({ userId: "player-2" }));
    mockApi.joinGame(created.roomCode, "Alex");
    localStorage.setItem("wagth:session", JSON.stringify(session));

    const started = mockApi.startGame(created.id);
    expect(started.status).toBe("active");
    expect(started.rounds).toHaveLength(1);
  });
});
