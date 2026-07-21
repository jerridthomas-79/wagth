import { Route, Routes } from "react-router-dom";
import { HomePage } from "../pages/HomePage";
import { JoinPage } from "../pages/JoinPage";
import { RoomPage } from "../pages/RoomPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/join" element={<JoinPage />} />
      <Route path="/room/:roomCode" element={<RoomPage />} />
    </Routes>
  );
}
