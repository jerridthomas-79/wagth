import { prompts } from "./prompts";
import { generateRoomCode, sanitizeRoomCode } from "./roomCode";
import type { Session } from "../types/game";

type MockPlayer = {
  id: string;
  userId: string;
  nickname: string;
  seatOrder: number;
  score: number;
  isHost: boolean;
  isActive: boolean;
  isConnected: boolean;
  joinedAt: string;
};

type MockRoundResponse = {
  id: string;
  playerId: string;
  responseText: string;
  submittedAt: string;
  displayOrder: number | null;
  isWinner: boolean;
};

type MockRound = {
  id: string;
  roundNumber: number;
  presenterPlayerId: string;
  promptId: number;
  promptText: string;
  status: "collecting" | "judging" | "winner_selected" | "completed";
  startedAt: string;
  submissionWarningAt: string;
  allSubmittedAt: string | null;
  completedAt: string | null;
  winnerResponseId: string | null;
  responses: MockRoundResponse[];
};

type MockGameRecord = {
  id: string;
  roomCode: string;
  name: string;
  hostUserId: string;
  status: "lobby" | "active" | "ended";
  currentRoundId: string | null;
  currentPresenterPlayerId: string | null;
  roundNumber: number;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  players: MockPlayer[];
  rounds: MockRound[];
  usedPromptIds: number[];
};

const SESSION_KEY = "wagth:session";
const GAMES_KEY = "wagth:games";
const channelName = "wagth-room-sync";
const roomLimit = 8;

function now(): string {
  return new Date().toISOString();
}

function uuid(): string {
  return crypto.randomUUID();
}

function readJson<T>(key: string, fallback: T): T {
  const value = localStorage.getItem(key);
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getGames(): MockGameRecord[] {
  return readJson<MockGameRecord[]>(GAMES_KEY, []);
}

function saveGames(games: MockGameRecord[]) {
  writeJson(GAMES_KEY, games);
  if ("BroadcastChannel" in window) {
    new BroadcastChannel(channelName).postMessage({ type: "games-updated" });
  }
}

function getSession(): Session {
  const session = readJson<Session | null>(SESSION_KEY, null);
  if (session) {
    return session;
  }

  const created = { userId: uuid() };
  writeJson(SESSION_KEY, created);
  return created;
}

function pickPrompt(game: MockGameRecord) {
  const available = prompts.filter(
    (prompt) => prompt.active && !game.usedPromptIds.includes(prompt.id),
  );
  if (available.length === 0) {
    game.usedPromptIds = [];
    return prompts[0];
  }

  return available[Math.floor(Math.random() * available.length)];
}

function nextPresenter(game: MockGameRecord, currentPresenterId: string | null) {
  const activePlayers = [...game.players]
    .filter((player) => player.isActive)
    .sort((left, right) => left.seatOrder - right.seatOrder);

  if (!currentPresenterId) {
    return activePlayers[Math.floor(Math.random() * activePlayers.length)];
  }

  const currentIndex = activePlayers.findIndex((player) => player.id === currentPresenterId);
  return activePlayers[(currentIndex + 1) % activePlayers.length];
}

function finalizeIfReady(round: MockRound, game: MockGameRecord) {
  const eligibleCount = game.players.filter(
    (player) => player.isActive && player.id !== round.presenterPlayerId,
  ).length;

  if (round.responses.length < eligibleCount) {
    return;
  }

  const shuffled = [...round.responses].sort(() => Math.random() - 0.5);
  shuffled.forEach((response, index) => {
    response.displayOrder = index + 1;
  });
  round.status = "judging";
  round.allSubmittedAt = now();
}

function updateGame(gameId: string, mutator: (game: MockGameRecord) => void): MockGameRecord {
  const games = getGames();
  const target = games.find((game) => game.id === gameId);
  if (!target) {
    throw new Error("Game not found.");
  }

  mutator(target);
  saveGames(games);
  return structuredClone(target);
}

export const mockApi = {
  subscribe(callback: () => void) {
    const listener = () => callback();
    const storageListener = (event: StorageEvent) => {
      if (event.key === GAMES_KEY) {
        callback();
      }
    };

    window.addEventListener("storage", storageListener);
    let channel: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel(channelName);
      channel.addEventListener("message", listener);
    }

    return () => {
      window.removeEventListener("storage", storageListener);
      channel?.removeEventListener("message", listener);
      channel?.close();
    };
  },

  getSession,

  listGames() {
    return getGames();
  },

  getGame(roomCode: string) {
    return (
      getGames().find((game) => game.roomCode === sanitizeRoomCode(roomCode)) ?? null
    );
  },

  createGame(nickname: string, gameName: string) {
    const session = getSession();
    const games = getGames();
    let roomCode = generateRoomCode();
    while (games.some((game) => game.roomCode === roomCode)) {
      roomCode = generateRoomCode();
    }

    const createdAt = now();
  const player: MockPlayer = {
      id: uuid(),
      userId: session.userId,
      nickname,
      seatOrder: 0,
      score: 0,
      isHost: true,
      isActive: true,
      isConnected: true,
      joinedAt: createdAt,
    };

    const game: MockGameRecord = {
      id: uuid(),
      roomCode,
      name: gameName || "We're All Going to Hell",
      hostUserId: session.userId,
      status: "lobby",
      currentRoundId: null,
      currentPresenterPlayerId: null,
      roundNumber: 0,
      createdAt,
      startedAt: null,
      endedAt: null,
      players: [player],
      rounds: [],
      usedPromptIds: [],
    };

    games.push(game);
    saveGames(games);
    return structuredClone(game);
  },

  joinGame(roomCode: string, nickname: string) {
    const session = getSession();
    const code = sanitizeRoomCode(roomCode);

    return updateGame(
      getGames().find((game) => game.roomCode === code)?.id ?? "",
      (game) => {
        if (game.status !== "lobby") {
          throw new Error("That room has already started.");
        }
        if (game.players.length >= roomLimit) {
          throw new Error("That room is full.");
        }

        const existing = game.players.find((player) => player.userId === session.userId);
        if (existing) {
          existing.nickname = nickname;
          existing.isConnected = true;
          return;
        }

        game.players.push({
          id: uuid(),
          userId: session.userId,
          nickname,
          seatOrder: game.players.length,
          score: 0,
          isHost: false,
          isActive: true,
          isConnected: true,
          joinedAt: now(),
        });
      },
    );
  },

  startGame(gameId: string) {
    return updateGame(gameId, (game) => {
      if (game.players.length < 2) {
        throw new Error("You need at least two players.");
      }

      const presenter = nextPresenter(game, null);
      const prompt = pickPrompt(game);
      const startedAt = now();
      const round: MockRound = {
        id: uuid(),
        roundNumber: 1,
        presenterPlayerId: presenter.id,
        promptId: prompt.id,
        promptText: prompt.text,
        status: "collecting",
        startedAt,
        submissionWarningAt: new Date(Date.now() + 60_000).toISOString(),
        allSubmittedAt: null,
        completedAt: null,
        winnerResponseId: null,
        responses: [],
      };

      game.status = "active";
      game.startedAt = startedAt;
      game.roundNumber = 1;
      game.currentRoundId = round.id;
      game.currentPresenterPlayerId = presenter.id;
      game.usedPromptIds.push(prompt.id);
      game.rounds = [round];
    });
  },

  submitResponse(gameId: string, responseText: string) {
    const session = getSession();
    const trimmed = responseText.trim();
    if (!trimmed) {
      throw new Error("Response cannot be blank.");
    }

    return updateGame(gameId, (game) => {
      const round = game.rounds.at(-1);
      const player = game.players.find((entry) => entry.userId === session.userId);
      if (!round || !player) {
        throw new Error("Unable to find your active round.");
      }
      if (player.id === round.presenterPlayerId) {
        throw new Error("Presenters cannot submit.");
      }
      if (round.responses.some((response) => response.playerId === player.id)) {
        throw new Error("You already submitted.");
      }

      const response: MockRoundResponse = {
        id: uuid(),
        playerId: player.id,
        responseText: trimmed,
        submittedAt: now(),
        displayOrder: null,
        isWinner: false,
      };
      round.responses.push(response);
      finalizeIfReady(round, game);
    });
  },

  selectWinner(gameId: string, responseId: string) {
    const session = getSession();
    return updateGame(gameId, (game) => {
      const round = game.rounds.at(-1);
      if (!round) {
        throw new Error("No active round found.");
      }

      const presenter = game.players.find((player) => player.id === round.presenterPlayerId);
      if (!presenter || presenter.userId !== session.userId) {
        throw new Error("Only the presenter can choose the winner.");
      }
      if (round.winnerResponseId) {
        throw new Error("That round already has a winner.");
      }

      const winner = round.responses.find((response) => response.id === responseId);
      if (!winner) {
        throw new Error("Response not found.");
      }

      winner.isWinner = true;
      round.winnerResponseId = winner.id;
      round.status = "winner_selected";
      round.completedAt = now();

      const player = game.players.find((entry) => entry.id === winner.playerId);
      if (player) {
        player.score += 1;
      }
    });
  },

  advanceRound(gameId: string) {
    return updateGame(gameId, (game) => {
      const lastRound = game.rounds.at(-1);
      if (!lastRound || !lastRound.winnerResponseId) {
        throw new Error("Pick a winner first.");
      }

      const presenter = nextPresenter(game, lastRound.presenterPlayerId);
      const prompt = pickPrompt(game);
      const roundNumber = game.roundNumber + 1;
      const startedAt = now();
      const round: MockRound = {
        id: uuid(),
        roundNumber,
        presenterPlayerId: presenter.id,
        promptId: prompt.id,
        promptText: prompt.text,
        status: "collecting",
        startedAt,
        submissionWarningAt: new Date(Date.now() + 60_000).toISOString(),
        allSubmittedAt: null,
        completedAt: null,
        winnerResponseId: null,
        responses: [],
      };

      game.roundNumber = roundNumber;
      game.currentRoundId = round.id;
      game.currentPresenterPlayerId = presenter.id;
      game.usedPromptIds.push(prompt.id);
      game.rounds.push(round);
    });
  },

  endGame(gameId: string) {
    return updateGame(gameId, (game) => {
      game.status = "ended";
      game.endedAt = now();
    });
  },
};
