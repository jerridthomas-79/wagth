import { isSupabaseConfigured } from "./env";
import { mockApi } from "./mockApi";
import { supabase } from "./supabase";
import type { GameRecord, Round, Session } from "../types/game";

const pollIntervalMs = 2_000;

type RoomResult = {
  roomCode: string;
};

async function ensureSupabaseSession(): Promise<Session> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw sessionError;
  }

  if (sessionData.session?.user.id) {
    return { userId: sessionData.session.user.id };
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(
      "Anonymous sign-in failed. Enable Anonymous Sign-Ins in Supabase Auth for this project.",
    );
  }

  return { userId: data.user.id };
}

async function rpcSingle<T>(fn: string, args: Record<string, unknown>) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    throw new Error(error.message);
  }

  if (Array.isArray(data)) {
    return (data[0] ?? null) as T | null;
  }

  return (data ?? null) as T | null;
}

async function getSupabaseGame(roomCode: string): Promise<GameRecord | null> {
  const snapshot = await rpcSingle<GameRecord>("get_game_state", {
    room_code_input: roomCode,
  });
  return snapshot;
}

function transformMockGame(roomCode: string): GameRecord | null {
  const session = mockApi.getSession();
  const game = mockApi.getGame(roomCode);
  if (!game) {
    return null;
  }

  const viewerPlayerId =
    game.players.find((player) => player.userId === session.userId)?.id ?? null;
  const currentRound = game.rounds.at(-1) ?? null;
  const winnerResponse =
    currentRound?.responses.find((response) => response.id === currentRound.winnerResponseId) ?? null;
  const winnerPlayer =
    game.players.find((player) => player.id === winnerResponse?.playerId) ?? null;

  const normalizedRound: Round | null = currentRound
    ? {
        ...currentRound,
        submittedCount: currentRound.responses.length,
        eligibleCount: game.players.filter(
          (player) => player.isActive && player.id !== currentRound.presenterPlayerId,
        ).length,
        winnerAuthorNickname: winnerPlayer?.nickname ?? null,
        winnerResponseText: winnerResponse?.responseText ?? null,
        responses: currentRound.responses.map((response) => ({
          id: response.id,
          responseText: response.responseText,
          displayOrder: response.displayOrder,
          isWinner: response.isWinner,
          authorNickname: response.isWinner ? winnerPlayer?.nickname ?? null : null,
        })),
      }
    : null;

  return {
    id: game.id,
    roomCode: game.roomCode,
    name: game.name,
    status: game.status,
    currentRoundId: game.currentRoundId,
    currentPresenterPlayerId: game.currentPresenterPlayerId,
    roundNumber: game.roundNumber,
    createdAt: game.createdAt,
    startedAt: game.startedAt,
    endedAt: game.endedAt,
    viewerPlayerId,
    players: game.players.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      seatOrder: player.seatOrder,
      score: player.score,
      isHost: player.isHost,
      isActive: player.isActive,
      isConnected: player.isConnected,
      joinedAt: player.joinedAt,
    })),
    currentRound: normalizedRound,
  };
}

export const gameApi = {
  isLive: isSupabaseConfigured,

  async getSession(): Promise<Session> {
    if (!isSupabaseConfigured) {
      return mockApi.getSession();
    }

    return ensureSupabaseSession();
  },

  async getGame(roomCode: string): Promise<GameRecord | null> {
    if (!isSupabaseConfigured) {
      return transformMockGame(roomCode);
    }

    await ensureSupabaseSession();
    return getSupabaseGame(roomCode);
  },

  subscribe(roomCode: string, callback: () => void) {
    if (!isSupabaseConfigured) {
      return mockApi.subscribe(callback);
    }

    const timer = window.setInterval(() => {
      void roomCode;
      callback();
    }, pollIntervalMs);

    return () => window.clearInterval(timer);
  },

  async createGame(nickname: string, gameName: string): Promise<RoomResult> {
    if (!isSupabaseConfigured) {
      const game = mockApi.createGame(nickname, gameName);
      return { roomCode: game.roomCode };
    }

    await ensureSupabaseSession();
    const created = await rpcSingle<{ room_code: string }>("create_game", {
      nickname,
      game_name: gameName,
    });

    if (!created?.room_code) {
      throw new Error("Unable to create game.");
    }

    return { roomCode: created.room_code };
  },

  async joinGame(roomCode: string, nickname: string): Promise<RoomResult> {
    if (!isSupabaseConfigured) {
      const game = mockApi.joinGame(roomCode, nickname);
      return { roomCode: game.roomCode };
    }

    await ensureSupabaseSession();
    const joined = await rpcSingle<{ room_code: string }>("join_game", {
      room_code_input: roomCode,
      nickname,
    });

    if (!joined?.room_code) {
      throw new Error("Unable to join game.");
    }

    return { roomCode: joined.room_code };
  },

  async startGame(gameId: string) {
    if (!isSupabaseConfigured) {
      mockApi.startGame(gameId);
      return;
    }

    await ensureSupabaseSession();
    await rpcSingle("start_game", { target_game_id: gameId });
  },

  async submitResponse(roundId: string, responseText: string) {
    if (!isSupabaseConfigured) {
      const games = mockApi.listGames();
      const game = games.find((entry) => entry.currentRoundId === roundId);
      if (!game) {
        throw new Error("Game not found.");
      }
      mockApi.submitResponse(game.id, responseText);
      return;
    }

    await ensureSupabaseSession();
    await rpcSingle("submit_response", {
      target_round_id: roundId,
      response_text_input: responseText,
    });
  },

  async selectWinner(roundId: string, responseId: string) {
    if (!isSupabaseConfigured) {
      const games = mockApi.listGames();
      const game = games.find((entry) => entry.currentRoundId === roundId);
      if (!game) {
        throw new Error("Game not found.");
      }
      mockApi.selectWinner(game.id, responseId);
      return;
    }

    await ensureSupabaseSession();
    await rpcSingle("select_winner", {
      target_round_id: roundId,
      target_response_id: responseId,
    });
  },

  async advanceRound(gameId: string) {
    if (!isSupabaseConfigured) {
      mockApi.advanceRound(gameId);
      return;
    }

    await ensureSupabaseSession();
    await rpcSingle("advance_round", { target_game_id: gameId });
  },

  async endGame(gameId: string) {
    if (!isSupabaseConfigured) {
      mockApi.endGame(gameId);
      return;
    }

    await ensureSupabaseSession();
    await rpcSingle("end_game", { target_game_id: gameId });
  },
};
