import type { CapacitorConfig } from "@capacitor/cli";

// The app ships the offline demo build of apps/web (see package.json "build:web").
const config: CapacitorConfig = {
  appId: "com.cryptoarena.game",
  appName: "CryptoArena",
  webDir: "www",
  backgroundColor: "#05060f",
  android: {
    backgroundColor: "#05060f",
  },
};

export default config;
