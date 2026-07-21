import { motion } from "framer-motion";
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { gameApi } from "../lib/gameApi";
import { sanitizeRoomCode } from "../lib/roomCode";

export function HomePage() {
  const navigate = useNavigate();
  const [createName, setCreateName] = useState("");
  const [gameName, setGameName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    try {
      const game = await gameApi.createGame(createName.trim(), gameName.trim());
      navigate(`/room/${game.roomCode}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create game.");
    }
  }

  async function onJoin(event: FormEvent) {
    event.preventDefault();
    try {
      const joined = await gameApi.joinGame(roomCode, joinName.trim());
      navigate(`/room/${joined.roomCode}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to join game.");
    }
  }

  return (
    <main className="page-shell home-shell">
      <motion.section
        className="hero"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="hero-mark">
          <img src="/wagth/assets/brand/logo-primary.svg" alt="We're All Going to Hell" />
        </div>
        <p className="hero-copy">
          A wicked little browser party game. Create a room, gather the sinners,
          then submit your answer only when you are ready to go to hell.
        </p>
      </motion.section>

      <section className="panel-grid">
        <form className="panel" onSubmit={onCreate}>
          <h2>Create Game</h2>
          <label>
            Nickname
            <input
              required
              maxLength={32}
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
            />
          </label>
          <label>
            Game Name
            <input
              maxLength={48}
              value={gameName}
              onChange={(event) => setGameName(event.target.value)}
            />
          </label>
          <button type="submit">Create Game</button>
        </form>

        <form className="panel" onSubmit={onJoin}>
          <h2>Join Game</h2>
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
              value={joinName}
              onChange={(event) => setJoinName(event.target.value)}
            />
          </label>
          <button type="submit">Join Game</button>
        </form>
      </section>

      <section className="status-panel">
        <p>
          {gameApi.isLive
            ? "This build is configured for the live Supabase backend with anonymous auth."
            : "Supabase env vars are missing, so the app is using the local multiplayer fallback."}
        </p>
        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </main>
  );
}
