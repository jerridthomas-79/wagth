import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CardShell } from "../components/ui/CardShell";
import { useGame } from "../hooks/useGame";
import { gameApi } from "../lib/gameApi";

function relativeSubmissionCopy(submitted: number, eligible: number) {
  return `${submitted} of ${eligible} have gone to hell`;
}

export function RoomPage() {
  const navigate = useNavigate();
  const params = useParams();
  const roomCode = params.roomCode ?? "";
  const { game, loading } = useGame(roomCode);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  const me = useMemo(
    () => game?.players.find((player) => player.id === game.viewerPlayerId) ?? null,
    [game],
  );
  const round = game?.currentRound ?? null;
  const presenter = game?.players.find((player) => player.id === round?.presenterPlayerId) ?? null;
  const myResponse = round?.responses.at(0) ?? null;
  const isPresenter = me?.id === presenter?.id;
  const lateWarning =
    round &&
    !isPresenter &&
    Date.now() >= new Date(round.submissionWarningAt).getTime() &&
    !myResponse;

  if (loading) {
    return (
      <main className="page-shell">
        <section className="panel">
          <h1>Loading room</h1>
          <p>Summoning the damned...</p>
        </section>
      </main>
    );
  }

  if (!game || !me) {
    return (
      <main className="page-shell">
        <section className="panel">
          <h1>Room not found</h1>
          <button onClick={() => navigate("/")}>Back Home</button>
        </section>
      </main>
    );
  }

  const currentGame = game;

  async function shareRoom() {
    const url = `${window.location.origin}/wagth/join?code=${currentGame.roomCode}`;
    if (navigator.share) {
      await navigator.share({
        title: currentGame.name,
        text: `Join my WAGTH room: ${currentGame.roomCode}`,
        url,
      });
      return;
    }
    await navigator.clipboard.writeText(url);
  }

  async function run(action: () => Promise<void>) {
    try {
      setError("");
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    }
  }

  return (
    <main className="page-shell room-shell">
      <header className="room-header panel">
        <div>
          <p className="eyebrow">Room Code</p>
          <h1>{currentGame.roomCode}</h1>
          <p>{currentGame.name}</p>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => void shareRoom()}>
            Share Room
          </button>
          {me.isHost ? (
            <button
              type="button"
              className="ghost-button"
              onClick={() => void run(() => gameApi.endGame(currentGame.id))}
            >
              End Game
            </button>
          ) : null}
        </div>
      </header>

      <section className="layout-grid">
        <aside className="panel sidebar">
          <h2>Players</h2>
          <ul className="player-list">
            {currentGame.players
              .slice()
              .sort((left, right) => left.seatOrder - right.seatOrder)
              .map((player) => (
                <li key={player.id}>
                  <span>
                    {player.nickname}
                    {player.isHost ? " (Host)" : ""}
                    {player.id === presenter?.id ? " (Presenter)" : ""}
                  </span>
                  <strong>{player.score}</strong>
                </li>
              ))}
          </ul>
          <p className="microcopy">
            Connection status: {gameApi.isLive ? "Supabase live backend" : "local demo fallback"}
          </p>
          {currentGame.status === "lobby" && me.isHost ? (
            <button type="button" onClick={() => void run(() => gameApi.startGame(currentGame.id))}>
              Start Game
            </button>
          ) : null}
        </aside>

        <section className="play-area">
          {currentGame.status === "lobby" ? (
            <div className="panel">
              <h2>Waiting in the lobby</h2>
              <p>Two to eight players can join before the host starts the game.</p>
            </div>
          ) : null}

          {currentGame.status === "ended" ? (
            <div className="panel">
              <h2>Game Over</h2>
              <p>The damned have been ranked. Start a fresh room whenever you want another round.</p>
              <button onClick={() => navigate("/")}>Return Home</button>
            </div>
          ) : null}

          {currentGame.status === "active" && round ? (
            <>
              <div className="round-meta panel">
                <div>
                  <p className="eyebrow">Round {round.roundNumber}</p>
                  <h2>{isPresenter ? "You're the Presenter" : "Answer the prompt"}</h2>
                </div>
                <p>{relativeSubmissionCopy(round.submittedCount, round.eligibleCount)}</p>
              </div>

              <CardShell variant="black" className="prompt-card">
                <p className="prompt-copy">{round.promptText}</p>
              </CardShell>

              {isPresenter ? (
                <section className="panel">
                  {round.status === "collecting" ? (
                    <p>No answer text is shown until everyone eligible submits.</p>
                  ) : null}

                  {round.status === "judging" || round.status === "winner_selected" ? (
                    <>
                      <h3>Anonymous Responses</h3>
                  <div className="response-grid">
                        {round.responses
                          .slice()
                          .sort((left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0))
                          .map((response) => {
                            const winner = round.winnerResponseId === response.id;
                            return (
                              <button
                                key={response.id}
                                className={`response-button ${winner ? "winner" : ""}`}
                                disabled={Boolean(round.winnerResponseId)}
                                onClick={() =>
                                  void run(() => gameApi.selectWinner(round.id, response.id))
                                }
                              >
                                <CardShell variant="white">
                                  <pre>{response.responseText}</pre>
                                  {winner ? (
                                    <strong>{response.authorNickname ?? "Winner"} wins +1</strong>
                                  ) : null}
                                </CardShell>
                              </button>
                            );
                          })}
                      </div>
                      {round.status === "winner_selected" ? (
                        <button
                          type="button"
                          onClick={() => void run(() => gameApi.advanceRound(currentGame.id))}
                        >
                          Next Round
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </section>
              ) : (
                <section className={`panel ${lateWarning ? "late-warning" : ""}`}>
                  {!myResponse ? (
                    <>
                      <label>
                        Your Answer
                        <textarea
                          rows={6}
                          maxLength={300}
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                        />
                      </label>
                      <div className="response-actions">
                        <button type="button" className="ghost-button" onClick={() => setDraft("")}>
                          Clear
                        </button>
                        <button
                          type="button"
                          onClick={() => void run(() => gameApi.submitResponse(round.id, draft))}
                        >
                          Go to Hell
                        </button>
                      </div>
                      <CardShell variant="white">
                        <pre>{draft || "Your wicked answer preview appears here."}</pre>
                      </CardShell>
                    </>
                  ) : (
                    <div className="wait-state">
                      <p>Your answer has gone to hell. Waiting for the others.</p>
                      <CardShell variant="white">
                        <pre>{myResponse.responseText}</pre>
                      </CardShell>
                    </div>
                  )}
                  {round.status === "winner_selected" && round.winnerAuthorNickname ? (
                    <div className="panel" style={{ marginTop: "1rem" }}>
                      <h3>Round Winner</h3>
                      <p>
                        {round.winnerAuthorNickname} won the round.
                      </p>
                      {round.winnerResponseText ? <pre>{round.winnerResponseText}</pre> : null}
                    </div>
                  ) : null}
                </section>
              )}
            </>
          ) : null}
        </section>
      </section>

      {error ? <p className="error-text">{error}</p> : null}
    </main>
  );
}
