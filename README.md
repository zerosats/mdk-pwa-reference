# MDK Chat

Encrypted messaging PWA. Uses MLS encryption over Nostr for relay-blind messaging — relays see encrypted blobs, never message content. AI agents can participate in chats and make Bitcoin payments autonomously via Arkade wallet infrastructure.

Other repos that are useful to get this up and running:

- [My fork of ZeroClaw](https://github.com/januszgrze/zeroclaw)
- [My fork of MDK](https://github.com/januszgrze/mdk)
- [Marmot CLI](https://github.com/zerosats/marmot-cli)
- [Maple AI proxy](https://github.com/OpenSecretCloud/maple-proxy/blob/master/README.md?ref=blog.trymaple.ai)

This is definitely incomplete and likely only works on my setup. We're working on some other stuff to make this idea more accessible to other builders (and users).

I need to add better docs to this, but shipping as a reference in the meantime. If you're interested in working on something related to this, feel free to email me at janusz@lxresearch.co :)

## Heads Up

This code is unaudited and was vibe coded. There are almost certainly privacy leaks in the current setup, and there are inherent risks with using PWAs for key management. Don't use this with real money you can't afford to lose — just use it for fun and experimentation.

## Prerequisites

- Node.js >= 18
- Git (with submodule support)

## Setup

```bash
git clone --recursive <repo-url>
cd mdk-chat-pwa
npm install
```

If you already cloned without `--recursive`:

```bash
git submodule update --init --recursive
```

## Development

```bash
npm run dev
```

Opens a local Vite dev server (default `http://localhost:5173`).

## Build

```bash
npm run build
```

Output goes to `dist/`.

## Project Structure

See [CLAUDE.md](./CLAUDE.md) for architecture details, directory layout, and technical notes.
