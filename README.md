# Rohlik Claw

A [NanoClaw](https://github.com/nanocoai/nanoclaw) template that turns an agent into a personal grocery assistant for [Rohlik.cz](https://www.rohlik.cz). It learns what you buy, estimates what's left at home, watches promotions, and builds carts you only have to approve.

> [!WARNING]
> Built on [rohlik-mcp](https://github.com/tomaspavlin/rohlik-mcp), an unofficial server using a reverse-engineered Rohlik API. Personal use only.

## Install

```bash
git clone https://github.com/abragtim/rohlik-claw.git
cp -r rohlik-claw/rohlik <path-to-your-nanoclaw>/templates/
```

Then, from your NanoClaw v2 install:

```bash
ncl groups create --template rohlik --name "Rohlik"
```

Two more steps — credentials and the MCP package, which templates deliberately don't carry — are in [`rohlik/README.md`](rohlik/README.md).

## What's in it

```
rohlik/
├── context/instructions.md     the agent's persona
├── .mcp.json                   the Rohlik MCP server, no secrets
└── skills/
    ├── grocery-memory/         learns preferences and staples from deliveries
    ├── shopping-planner/       builds a full cart proposal
    ├── fridge-tracker/         estimates what's at home
    └── receipt-scanner/        reads receipt photos from any store
```

Everything the agent knows about your household is a Markdown file under `/workspace/agent/grocery/` — readable, editable, deletable.

## Why a template and not a fork

This started life as a NanoClaw v1 fork: MCP server baked into the container image, credentials passed through the host code, skills living in the install. Every upstream update meant a merge conflict.

NanoClaw v2 moved agent specialization out of the code. MCP servers, persona, skills and tasks belong to an agent group, declared in config rather than compiled in — so an agent can be a folder you copy instead of a fork you maintain. One install can run this alongside any number of unrelated agents, each with its own tools and memory.

The v1 fork's history is still in this repository. The install it grew into lives at [abragtim/nanoclaw](https://github.com/abragtim/nanoclaw).

## Requirements

- A NanoClaw v2 install
- A [Rohlik.cz](https://www.rohlik.cz) account
- Any channel wired up; Telegram or WhatsApp if you want to send receipt photos

## License

MIT
