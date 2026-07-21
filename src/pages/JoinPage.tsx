import { FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { gameApi } from "../lib/gameApi";
import { sanitizeRoomCode } from "../lib/roomCode";

export function JoinPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [roomCode, setRoomCode] = useState(sanitizeRoomCode(params.get("code") ?? ""));
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      const joined = await gameApi.joinGame(roomCode, nickname.trim());
      navigate(`/room/${joined.roomCode}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to join game.");
    }
  }

  return (
    <main className="page-shell">
      <section className="panel" style={{ maxWidth: "32rem", margin: "4rem auto 0" }}>
        <h1>Join Game</h1>
        <p>Enter your nickname and step directly into the room.</p>
        <form className="panel-grid" onSubmit={onSubmit}>
          <label>
            Room Code
            <input
              required
              maxLength={4}
              value={roomCode}
              onChange={(event) => setRoomCode(sanitizeRoomCode(event.target.value))}
            />
          </label>
          <label>
            Nickname
            <input
              required
              maxLength={32}
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
            />
          </label>
          <button type="submit">Join Game</button>
        </form>
        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </main>
  );
}
