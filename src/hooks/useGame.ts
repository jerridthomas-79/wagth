import { useEffect, useState } from "react";
import { gameApi } from "../lib/gameApi";
import type { GameRecord, Session } from "../types/game";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    void gameApi.getSession().then(setSession);
  }, []);

  return session;
}

export function useGame(roomCode: string) {
  const [game, setGame] = useState<GameRecord | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setGame(await gameApi.getGame(roomCode));
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    void load();

    return gameApi.subscribe(roomCode, () => {
      void load();
    });
  }, [roomCode]);

  return { game, loading };
}
