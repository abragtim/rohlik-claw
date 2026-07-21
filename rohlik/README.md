# Rohlik — grocery agent template

A NanoClaw v2 agent that does your [Rohlik.cz](https://www.rohlik.cz) shopping: it learns what you buy, estimates what's left at home, watches promotions, and builds carts you only have to approve.

> [!WARNING]
> This template relies on [rohlik-mcp](https://github.com/tomaspavlin/rohlik-mcp), an unofficial server built on a reverse-engineered Rohlik API. Personal use only.

## What you get

| Skill | What it does |
|-------|--------------|
| `grocery-memory` | Reads completed deliveries and distills preferences, staples, and buying patterns |
| `shopping-planner` | Runs the full order workflow — fridge state, preferences, promotions, meal plan — and proposes a cart |
| `fridge-tracker` | Estimates current fridge and pantry contents, calibrating against your real reorder intervals |
| `receipt-scanner` | Reads a photo of a receipt from any store and folds those items into the fridge estimate |

The skills keep their state as Markdown under `/workspace/agent/grocery/`, so everything the agent believes about your household is a file you can open, correct, or delete.

## Install

Templates resolve from your install's local `templates/` directory, so copy this folder in first:

```bash
cp -r rohlik <path-to-your-nanoclaw>/templates/
```

Then, from your NanoClaw checkout:

```bash
# 1. Stamp the agent
ncl groups create --template rohlik --name "Rohlik"
#    Note the group id it prints — every step below needs it.

# 2. Install the MCP server into the group's container
ncl groups config add-package --id <group-id> --npm @tomaspavlin/rohlik-mcp@3.3.0

# 3. Supply your Rohlik credentials
ncl groups config add-mcp-server --id <group-id> --name rohlik --command rohlik-mcp \
  --env '{"ROHLIK_USERNAME":"you@example.com","ROHLIK_PASSWORD":"your-password","ROHLIK_BASE_URL":"https://www.rohlik.cz"}'

# 4. Rebuild so the package lands in the image
ncl groups restart --rebuild --id <group-id>
```

Templates carry no packages and no secrets by design, which is why steps 2 and 3 are separate. Step 3 replaces the credential-free server declaration this template ships.

Finally wire the agent to a channel — `/manage-channels`, or `ncl wirings create`. Any channel works; Telegram and WhatsApp are the natural fits for sending receipt photos.

> [!IMPORTANT]
> Step 3 writes your Rohlik password in plaintext into `groups/<group>/container.json`. That path is gitignored in NanoClaw — keep it that way.

## First run

The agent starts with no idea who you are. Ask it to read your order history:

> analyze my last few Rohlik deliveries

`grocery-memory` populates `grocery/preferences.md`, `staples.md`, `patterns.md` and friends from completed deliveries only — never from a cart that was merely planned. Accuracy improves as more deliveries land.

Then use it:

- **"prepare a weekly order"** — the full workflow, ending in a cart proposal
- **"I need milk"** — searches and adds, no questions
- **"what do we need?"** — what's running low, from the fridge estimate
- *send a photo of a receipt* — folds non-Rohlik purchases into the estimate

## Customizing

Everything lives in files:

- `context/instructions.md` — the agent's persona, always in its prompt. Keep it under ~200 lines.
- `skills/<name>/SKILL.md` — how each skill works. Editing one changes the behavior, no code involved.
- `grocery/household.md` (created on first use) — household size, dietary needs, budget. Worth filling in by hand early; it steers every plan.

## Optional: scheduled tasks

A restock check makes sense on a weekly cadence. Add one with:

```bash
ncl tasks create --name restock-check --recurrence "0 18 * * 5" \
  --prompt "Check what we're running low on and suggest an order"
```

This template ships no tasks, so nothing runs in the background until you ask for it.
