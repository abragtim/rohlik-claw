<p align="center">
  <img src="assets/nanoclaw-logo.png" alt="Rohlik Claw" width="400">
</p>

<p align="center">
  A personal AI grocery assistant for <a href="https://www.rohlik.cz">Rohlik.cz</a>, built on <a href="https://github.com/nanocoai/nanoclaw">NanoClaw</a> v2.
</p>

> [!WARNING]
> This project is based on the unofficial [rohlik-mcp](https://github.com/tomaspavlin/rohlik-mcp) server, which uses a reverse-engineered Rohlik API. It is for personal use only.

---

## What Is This

Rohlik Claw is a customized [NanoClaw](https://github.com/nanocoai/nanoclaw) instance that turns Claude into a personal grocery shopping assistant. It connects to [Rohlik.cz](https://www.rohlik.cz) via the [rohlik-mcp](https://github.com/tomaspavlin/rohlik-mcp) server and manages your grocery orders through Telegram (or any other supported channel).

The agent learns your shopping habits over time — it tracks what you buy, estimates what's left in your fridge, finds relevant deals, and builds smart shopping lists.

## Features

- **Full Rohlik integration** — search products, add to cart, check delivery slots, browse discounts, view order history
- **Grocery memory** — learns your preferences, staple items, brand loyalty, and dietary restrictions from delivery history
- **Fridge tracking** — estimates what you have at home based on deliveries and consumption rates, with self-calibrating accuracy
- **Receipt scanning** — send a photo of a grocery receipt from any store (Albert, Lidl, Tesco, etc.) to update your fridge inventory with non-Rohlik purchases
- **Image understanding** — the agent sees and understands photos you send; attachment handling is built into NanoClaw v2
- **Shopping planner** — builds optimized orders combining fridge state, preferences, promotions, and meal planning
- **Meal suggestions** — recommends meals based on what's in your fridge and what you like to cook
- **Multi-channel messaging** — Telegram is wired up here; Discord, Slack, WhatsApp and others install via their `/add-<channel>` skill
- **Container isolation** — agents run in sandboxed Linux containers, not on your host machine
- **Scheduled tasks** — restock reminders and recurring orders, managed with `ncl tasks`
- **Web access** — search and browse the web when needed

## Quick Start

### Prerequisites

- macOS or Linux
- Node.js 22+ (20.12 is the hard floor — the setup wizard uses `styleText` from `node:util`)
- [Docker](https://docker.com/products/docker-desktop)
- [Claude Code](https://claude.ai/download)
- A [Rohlik.cz](https://www.rohlik.cz) account

### Setup

```bash
git clone https://github.com/abragtim/rohlik-claw.git
cd rohlik-claw
bash nanoclaw.sh
```

`nanoclaw.sh` takes a fresh machine to a running agent: it installs Node, pnpm and Docker if missing, registers your Anthropic credential with the OneCLI vault, builds the agent container, and pairs your first channel. If a step fails it hands off to Claude Code to diagnose and resume.

### Rohlik credentials

Rohlik access is configured per agent group, in `groups/<group>/container.json`:

```json
{
  "mcpServers": {
    "rohlik": {
      "command": "rohlik-mcp",
      "args": [],
      "env": {
        "ROHLIK_USERNAME": "your@email.com",
        "ROHLIK_PASSWORD": "your-password",
        "ROHLIK_BASE_URL": "https://www.rohlik.cz"
      }
    }
  },
  "packages": {
    "npm": ["@tomaspavlin/rohlik-mcp@3.3.0", "zod@3.25.76"]
  }
}
```

`packages.npm` installs the MCP server into the group's container; `mcpServers` tells the agent how to launch it. Both are v2 mechanisms — v1 baked rohlik-mcp into the image at build time and passed credentials through the container runner.

> [!IMPORTANT]
> `container.json` holds your Rohlik password in plaintext. `groups/*` is gitignored — keep it that way.

## Usage

### Talk to it

- **Full order** — "prepare a weekly order" — runs the full workflow: analyzes recent deliveries, checks fridge state, scans promotions, builds a smart cart proposal
- **Quick top-up** — "I need milk" — searches and adds items directly, no questions asked
- **Restock check** — "what do we need?" — shows what's running low based on fridge estimates
- **Receipt** — send a photo of a store receipt to fold non-Rohlik purchases into the fridge estimate

### Run it in the background

Service names are per-install in v2 — the launchd label and systemd unit are slugged to the project root, so derive them instead of guessing:

```bash
# macOS
LABEL=$(pnpm exec tsx -e "import{getLaunchdLabel}from'./src/install-slug.js';console.log(getLaunchdLabel())")
launchctl kickstart -k "gui/$(id -u)/$LABEL"

# Linux
UNIT=$(pnpm exec tsx -e "import{getSystemdUnit}from'./src/install-slug.js';console.log(getSystemdUnit())")
systemctl --user restart "$UNIT"
```

On Linux, user services stop at logout unless you enable lingering:

```bash
sudo loginctl enable-linger $USER
```

### Watch it

```bash
tail -f logs/nanoclaw.log     # host activity
ncl tasks list                # scheduled tasks
ncl sessions list             # live agent sessions
```

### How It Learns

The agent builds a grocery profile in `groups/<group>/grocery/` (mounted at `/workspace/agent/grocery/` inside the container) by analyzing your completed Rohlik deliveries:

| File | What It Tracks |
|------|---------------|
| `preferences.md` | Taste profile, brand preferences, dietary restrictions |
| `staples.md` | Always-buy items with quantities and Rohlik product IDs |
| `patterns.md` | Co-purchase patterns, seasonal trends, order frequency |
| `fridge-state.md` | Estimated current fridge/pantry contents |
| `meals.md` | Favorite meals and their ingredients |
| `spending.md` | Order costs and spending trends |
| `household.md` | Household size, dietary needs, budget |
| `delivery-log.md` | Processed delivery summaries |
| `planning-feedback.md` | Tracked corrections (promotes to preferences after 3+ repeats) |

Memory updates only from **completed deliveries**, never from planned carts. The agent also calibrates its fridge consumption estimates against your actual reorder intervals.

Separately from the grocery profile, the agent's standing identity lives in `groups/<group>/instructions.prepend.md` and its durable facts in `groups/<group>/memory/` — v2's shared memory tree. Neither is committed.

## Architecture

Built on [NanoClaw](https://github.com/nanocoai/nanoclaw) v2 — a host process plus containerized Claude agents.

```
Channel --> host --> inbound.db --> container (Claude Agent SDK + Rohlik MCP) --> outbound.db --> reply
```

Each session has two SQLite databases with exactly one writer each: the host writes `inbound.db`, the container writes `outbound.db`. Agent containers are spawned per agent group and mount that group's folder at `/workspace/agent`.

**Security boundaries:**

- Agents run in Docker containers, isolated from the host filesystem apart from their own group folder and any declared `additionalMounts`.
- Anthropic credentials live in the OneCLI vault; the gateway injects them into outbound requests, so the container never holds the real key.
- Rohlik credentials *are* passed into the container — the MCP server needs them to authenticate.

### Container Skills

| Skill | Purpose |
|-------|---------|
| `grocery-memory` | Analyzes delivery history, extracts preferences, maintains the grocery profile |
| `shopping-planner` | Orchestrates the full order workflow with parallel subagents |
| `fridge-tracker` | Estimates current fridge/pantry contents using consumption models |
| `receipt-scanner` | Extracts items from store receipt photos and updates fridge state |

### Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Host orchestrator: message loop, session management, agent invocation |
| `src/container-runner.ts` | Spawns agent containers with their mounts and MCP config |
| `src/channels/telegram.ts` | Telegram channel adapter |
| `groups/<group>/container.json` | Per-group container config — Rohlik MCP server, npm packages, mounts |
| `groups/<group>/instructions.prepend.md` | Agent persona |
| `groups/<group>/memory/` | Durable agent memory (OKF-compatible) |
| `groups/<group>/grocery/` | Grocery profile the skills read and write |
| `container/skills/` | Container skills, including the four grocery ones |

## Customizing

NanoClaw doesn't use configuration files for behavior. To make changes, tell Claude Code what you want:

- "Make responses shorter"
- "Add Discord as a channel" (run `/add-discord`)
- "Schedule a restock check every Friday"

## Development

```bash
pnpm run dev          # run with hot reload
pnpm run build        # compile TypeScript
pnpm test             # run the test suite
./container/build.sh  # rebuild the agent container
```

## Upstream

This is a fork of [NanoClaw](https://github.com/nanocoai/nanoclaw). To pull upstream updates, run `/update-nanoclaw`.

This install was migrated from NanoClaw v1 (1.2.22) to v2 — v1's WhatsApp channel and custom image-vision code were replaced by Telegram and v2's native attachment handling. The v1 sources remain in this repository's history.

## License

MIT
