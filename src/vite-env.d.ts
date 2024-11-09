/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ALCHEMY_API_KEY: string
  readonly VITE_ETHERSCAN_API_KEY: string
  readonly VITE_TWITTER_API_KEY: string
  readonly VITE_DISCORD_API_KEY: string
  readonly VITE_TELEGRAM_API_KEY: string
  readonly VITE_GITHUB_API_KEY: string
  readonly VITE_RUGDOC_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}