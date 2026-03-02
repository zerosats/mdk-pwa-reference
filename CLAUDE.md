# MDK Chat — Encrypted Messaging with AI Agents

## Project Thesis

A messaging PWA where users interact with AI agents that can make Bitcoin payments autonomously. The chat uses MLS encryption over Nostr (relay-blind messaging — relays cannot read message content).

## Repository Structure

```
/
├── src/                    # Chat PWA (Vue 3 + TypeScript)
│   ├── components/         # Chat UI components
│   ├── views/              # Page views
│   ├── stores/             # Pinia state (agent, chat, settings, wallet, seed)
│   ├── services/           # mdk.ts, nostr.ts, key-derivation.ts
│   └── lib/                # Arkade wallet, seed derivation, swaps
├── packages/
│   ├── mdk/                # Git submodule — MLS protocol (Rust)
│   ├── mdk-wasm/           # Compiled WASM bindings (2.6MB)
│   └── mdk-wasm-src/       # WASM binding source (Rust)
├── mdk-cli/                # MDK CLI tool (Rust)
├── audits/                 # Security audits
├── plans/                  # Daily plans
└── CLAUDE.md               # This file
```

## Key SDKs

| Package | Purpose |
|---------|---------|
| `@arkade-os/sdk` | Ark protocol wallet |
| `mdk-wasm` | MLS encryption (WASM) |
| `nostr-tools` | Nostr protocol |
| `pinia` | State management |
| `vue-router` | Routing |

## Agent Behavior Rules

- **ALWAYS ask before making edits** unless user has given explicit permission
- **Read DEBUG_PROGRESS.md** before working on chat issues
- **Read existing code** before proposing changes
- **Match existing patterns**: Vue 3 + TypeScript + Pinia stores

## Source Structure (src/)

```
src/
├── components/
│   ├── chat/           # MessageList, MessageBubble, MessageInput, EncryptionBadge
│   ├── agent/          # AgentConnect, AgentStatus
│   └── common/         # LoadingOverlay, ConnectionStatus
├── views/
│   ├── HomeView.vue
│   ├── ChatView.vue
│   ├── ConnectAgentView.vue
│   └── SettingsView.vue
├── stores/
│   ├── agent.ts        # Agent connection, group management
│   ├── chat.ts         # Message state
│   ├── wallet.ts       # Arkade wallet state
│   ├── seed.ts         # Seed derivation
│   └── settings.ts     # User preferences
├── services/
│   ├── mdk.ts          # WASM initialization, MDK API calls
│   ├── nostr.ts        # Relay connections, subscriptions
│   ├── key-derivation.ts
│   └── passkey.ts      # WebAuthn/passkey support
└── lib/
    ├── arkade/         # HD scanner, balance, derivation
    ├── seed/           # BIP39 seed derivation
    └── swaps/          # Lendasat swap validation
```

## Technical Notes

- **MDK WASM requires LLVM** for secp256k1 compilation
- **OpenMLS needs `js` feature** for WASM target
- **Nostr event kinds**: 443 (key package), 444 (welcome), 445 (MLS message)
- **Relay-blind messaging**: Nostr relays see encrypted blobs + metadata, cannot read message content

## Related Repos

- **arkadecash-cli** — Unified Bitcoin payments CLI for AI agents (Arkade, Cashu, Boltz, Lendasat)
- **arkade-wallet-pwa** — Standalone wallet PWA (Arkade, Cashu)
