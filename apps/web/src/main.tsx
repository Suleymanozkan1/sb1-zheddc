import "./polyfills";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { WalletProviders } from "./wallet/WalletProviders";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WalletProviders>
      <App />
    </WalletProviders>
  </StrictMode>,
);
