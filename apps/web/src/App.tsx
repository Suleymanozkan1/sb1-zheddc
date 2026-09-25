import { Spinner } from "@cryptoarena/ui";
import { Suspense, lazy, useEffect, useState } from "react";
import { Toasts, TopBar } from "./components/Layout";
import { api } from "./lib/api";
import { useApp } from "./lib/store";
import { Characters } from "./screens/Characters";
import { Dashboard } from "./screens/Dashboard";
import { Inventory } from "./screens/Inventory";
import { Landing } from "./screens/Landing";
import { Leaderboard } from "./screens/Leaderboard";
import { Quests } from "./screens/Quests";
import { Settings } from "./screens/Settings";
import { Shop } from "./screens/Shop";
import { Wallet } from "./screens/Wallet";

// Phaser is large: load the game only when entering the arena.
const GameView = lazy(() => import("./components/GameView").then((m) => ({ default: m.GameView })));

export function App() {
  const { me, setMe, screen, go } = useApp();
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    api
      .me()
      .then((m) => {
        setMe(m);
        go("dashboard");
      })
      .catch(() => go("landing"))
      .finally(() => setBooting(false));
  }, [setMe, go]);

  useEffect(() => {
    if (me && screen === "landing") go("dashboard");
  }, [me, screen, go]);

  if (booting) {
    return (
      <div className="flex h-full items-center justify-center text-cyan-300">
        <Spinner />
      </div>
    );
  }

  if (!me || screen === "landing") {
    return (
      <>
        <Landing />
        <Toasts />
      </>
    );
  }

  if (screen === "game") {
    return (
      <>
        <Suspense fallback={<div className="flex h-full items-center justify-center text-cyan-300"><Spinner /></div>}>
          <GameView />
        </Suspense>
        <Toasts />
      </>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <TopBar />
      {screen === "dashboard" && <Dashboard />}
      {screen === "characters" && <Characters />}
      {screen === "inventory" && <Inventory />}
      {screen === "shop" && <Shop />}
      {screen === "wallet" && <Wallet />}
      {screen === "leaderboard" && <Leaderboard />}
      {screen === "quests" && <Quests />}
      {screen === "settings" && <Settings />}
      <Toasts />
    </div>
  );
}
