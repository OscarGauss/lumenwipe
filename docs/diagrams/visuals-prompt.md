# Prompt to regenerate the LumenWipe diagrams as polished visuals

Use this with **Claude Desktop** (not Claude Code) to turn the Mermaid diagrams into clean, branded visuals for the docs and the SCF submission.

## How to use

1. Open Claude Desktop.
2. Attach the 10 source files from this folder: `00-high-level-overview.mmd` through `09-mediator-flow.mmd`.
3. (Optional) If you have the Excalidraw MCP connected, mention it so Claude produces editable `.excalidraw` scenes. Otherwise it will produce clean SVGs you can refine in Excalidraw or Whimsical.
4. Paste the prompt below.

---

## Prompt (copy from here)

I'm attaching 10 Mermaid diagram sources for **LumenWipe**, an open-source, non-custodial tool that closes a Stellar account and recovers its locked reserves. I want you to recreate each one as a polished, presentable visual for our documentation and our Stellar Community Fund submission. Keep the meaning and the labels faithful to the Mermaid source; you are restyling, not redesigning.

**Brand and style (apply consistently to all 10):**
- Primary brand color: indigo `#4F46E5` (with `#818CF8` light and `#4338CA` dark for accents). Use neutral slate/gray for secondary nodes and a clean near-white background. Optionally also produce a dark-background variant.
- Typography: Inter (or a clean geometric sans). Comfortable spacing, rounded rectangles, clear arrowheads.
- Consistent visual language across all diagrams: use indigo to mark the **client / non-custodial** parts (the browser, signing), neutral gray for **read-only data sources**, and one distinct accent for the **Stellar network**.
- Where a diagram shows the trust boundary or "keys never leave the browser," make that visually obvious (a labelled enclosure or a small lock motif). Non-custodial is the core message.
- Readable at a glance. This is for reviewers, not engineers debugging.

**Output:**
- One visual per source file, named to match: `00-high-level-overview`, `01-system-architecture`, ... `09-mediator-flow`.
- If the Excalidraw MCP is available, produce editable `.excalidraw` scenes plus an exported `.svg` and `.png` each. Otherwise produce clean standalone `.svg` (and `.png`) per diagram.
- Start with `00-high-level-overview`, since that is the hero diagram for the submission; get its style right, then apply the same style to the rest.

**What each diagram conveys (so you emphasize the right thing):**

| File | What it shows | Emphasize |
|---|---|---|
| `00-high-level-overview` | The whole system in one glance: user → 4-step browser flow → Stellar, with read-only data feeding in | The hero diagram. Non-custodial browser flow; reviewer should "get it" in 5 seconds |
| `01-system-architecture` | Three layers: browser client, read-only backend, data sources | The trust boundary; signed transactions go from the client straight to Stellar RPC |
| `02-data-flow` | Enumerate (indexer) → re-read live (RPC) → build plan → simulate → submit | We never act on stale data; live re-read before signing |
| `03-state-machine` | The wind-down flow states, including resume and failure paths | Resumable, recoverable flow |
| `04-signing-flow` | Unsigned XDR → wallet or secret key → review → submit → poll | Keys stay client-side; explicit review before submit |
| `05-defi-adapter-fallback` | OctoPos primary → Orion fallback → degraded mode | Dual-provider resilience |
| `06-execution-plan` | The ordered wind-down steps | Deterministic ordering that satisfies ledger constraints |
| `07-blend-unwind` | Repay debt → withdraw supply → backstop Q4W note | Repay before withdraw; the 17-day backstop queue |
| `08-asset-conversion-routing` | Quote route → minimum received → path payment or Soroban swap → remove trustline | Slippage protection; classic and Soroban handled |
| `09-mediator-flow` | Sequence: source → temporary mediator → exchange destination with memo | Why exchanges need the mediator; the disclosed 1 XLM cost |

Keep each visual editable so we can tweak wording later. Match the node text to the Mermaid sources.

## After you get the visuals back

Save them under `docs/diagrams/rendered/` and embed them in the docs where the Mermaid blocks live (or keep the Mermaid for GitHub/GitBook and use the polished exports for Whimsical and the submission deck). The inline Mermaid in `architecture.md` stays as the source of truth; these exports are for presentation.
