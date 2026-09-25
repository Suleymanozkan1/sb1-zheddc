# Repos

Bu depo aşağıdaki projeleri git submodule olarak içerir (`repos/` altında).

Klonlamak için:

```bash
git clone --recurse-submodules <bu-repo-url>
# veya mevcut klonda:
git submodule update --init --recursive
```

| Klasör | Kaynak |
|---|---|
| repos/colyseus-tutorial-phaser | https://github.com/colyseus/tutorial-phaser |
| repos/halftheopposite-tosios | https://github.com/halftheopposite/tosios |
| repos/knagaitsev-io-template | https://github.com/knagaitsev/io-template |
| repos/phaserjs-phaser | https://github.com/phaserjs/phaser |
| repos/colyseus-colyseus | https://github.com/colyseus/colyseus |
| repos/anza-xyz-kit | https://github.com/anza-xyz/kit |
| repos/anza-xyz-wallet-adapter | https://github.com/anza-xyz/wallet-adapter |
| repos/metaplex-foundation-mpl-token-metadata | https://github.com/metaplex-foundation/mpl-token-metadata |
| repos/solana-foundation-anchor | https://github.com/solana-foundation/anchor |
| repos/prisma-orm | https://github.com/prisma/orm |

Submodule'leri en son sürüme güncellemek için:

```bash
git submodule update --remote
```
