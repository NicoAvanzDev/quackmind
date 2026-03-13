# quackmind

Semantic memory storage for Claude Code using DuckDB with local vector embeddings.

Store files, code snippets, and notes — then search them with natural language using vector similarity. No API keys, no external services — everything runs locally.

## How it works

- **DuckDB** stores your content with vector embeddings in a single `.duckdb` file
- **all-MiniLM-L6-v2** (via `@xenova/transformers`) generates 384-dimensional embeddings locally (~80MB model, downloaded on first run)
- **HNSW indexing** enables fast approximate nearest neighbor search
- **MCP server** exposes tools to Claude Code for store, search, ingest, and more

## Installation

```bash
git clone https://github.com/NicoAvanzDev/quackmind.git
cd quackmind
npm install
npm run build
```

## Usage as Claude Code Plugin

### Option 1: Plugin directory (recommended)

```bash
claude --plugin-dir /path/to/quackmind
```

### Option 2: Add to MCP servers

Add to your `claude` config (`.claude/settings.json`):

```json
{
  "mcpServers": {
    "quackmind": {
      "command": "node",
      "args": ["/path/to/quackmind/dist/server.js"]
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `store` | Store text/code/notes with embeddings |
| `search` | Semantic search using natural language |
| `ingest_file` | Chunk and ingest a single file |
| `ingest_directory` | Recursively ingest all source files in a directory |
| `get` | Retrieve a specific item by ID |
| `delete` | Remove an item |
| `list` | Browse stored items (most recent first) |
| `stats` | Storage statistics and type breakdown |

## Storage

The DuckDB database is created at `.duckdb-memory/memory.duckdb` relative to where the MCP server runs. The embedding model is cached by `@xenova/transformers` in `~/.cache/xenova/`.

## Supported File Types for Ingestion

TypeScript, JavaScript, Python, Ruby, Rust, Go, Java, C/C++, C#, PHP, Swift, Kotlin, Shell, SQL, Markdown, JSON, YAML, TOML, Terraform

## Architecture

```
src/
├── server.ts    # MCP server with tool definitions
├── db.ts        # DuckDB connection, schema, CRUD operations
├── embed.ts     # Local embedding via @xenova/transformers
└── ingest.ts    # Text chunking and file type detection
```

## Author

[NicoAvanzDev](https://github.com/NicoAvanzDev)

## License

MIT
