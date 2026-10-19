# Gozec

**All around. Out of sight.**

[![Live site badge](https://img.shields.io/badge/live%20site-gozec.pro-yellow?style=flat-square)](https://gozec.pro)
![Chain: Solana](https://img.shields.io/badge/chain-Solana-blue?style=flat-square)

- **Chain:** Solana
- **Contract address:** pending

## Overview

Gozec is a Solana project built on discretion. The site pairs the project story with a live board of the ten busiest Solana tokens, pulled straight from a public market feed.

## Features

- Live board: top ten Solana tokens by 24 hour volume, with logo, price, 24 hour change, volume, liquidity and a copy button per address
- Scrolling ticker fed by the same data
- Contract address slot at the top of the page, inert until the address is confirmed
- Social icons that stay inert until each link is confirmed
- Motion with a full reduced-motion fallback
- Static output in `dist/`, ready to drop onto any static host

## Links

- Website: [gozec.pro](https://gozec.pro)
- X: pending
- GitHub: pending
- Whitepaper: [docs/whitepaper.md](docs/whitepaper.md)

## Build

```bash
npm install
npm run build
npm run gates
```

`dist/` is the deploy folder.

## License

MIT, see [LICENSE](LICENSE).
