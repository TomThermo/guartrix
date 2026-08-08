# API docs UI (panel)

The Guartrix **API Reference** is a dedicated product, separate from the operator wiki:

| Panel URL | Content |
|-----------|---------|
| `/api-docs` | Overview (this suite’s map + quick start) |
| `/api-docs/explorer` | Interactive Try it + multi-language snippets |
| `/api-docs/examples` | Static curl + sample JSON |
| `/api-docs/conventions` | Errors, auth, rate limits |
| `/api-docs/client` | Client API (`gt_`) |
| `/api-docs/application` | Application API + billing (`gta_`) |

Markdown sources remain under `docs/wiki/api-*.md` (GitHub + embedded in the panel at build time).

Old wiki paths (`/wiki/api-overview`, `/wiki/client-api`, …) **redirect** to the matching `/api-docs/…` route.

Nav: panel header/footer **API** link · wiki hero **API docs** button.
