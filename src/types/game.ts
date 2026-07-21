export type GameStatus = "lobby" | "active" | "ended";
export type RoundStatus =
  | "collecting"
  | "ready_for_judging"
  | "judging"
  | "winner_selected"
  | "completed";

export type Player = {
  id: string;
  nickname: string;
  seatOrder: number;
  score: number;
  isHost: boolean;
  isActive: boolean;
  isConnected: boolean;
  joinedAt: string;
};

export type RoundResponse = {
  id: string;
  responseText: string;
  displayOrder: number | null;
  isWinner: boolean;
  authorNickname: string | null;
};

export type Round = {
  id: string;
  roundNumber: number;
  presenterPlayerId: string;
  promptId: number;
  promptText: string;
  status: RoundStatus;
  startedAt: string;
  submissionWarningAt: string;
  allSubmittedAt: string | null;
  completedAt: string | null;
  winnerResponseId: string | null;
  submittedCount: number;
  eligibleCount: number;
  winnerAuthorNickname: string | null;
  winnerResponseText: string | null;
  responses: RoundResponse[];
};

export type GameRecord = {
  id: string;
  roomCode: string;
  name: string;
  status: GameStatus;
  currentRoundId: string | null;
  currentPresenterPlayerId: string | null;
  roundNumber: number;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  viewerPlayerId: string | null;
  players: Player[];
  currentRound: Round | null;
};

export type Session = {
  userId: string;
};
