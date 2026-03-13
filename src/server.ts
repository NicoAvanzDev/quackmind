#!/usr/bin/env node
/**
 * MCP server for DuckDB-backed semantic memory.
 * Exposes tools: store, search, get, delete, list, ingest_file, stats.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { MemoryDB } from "./db.js";
import { embed, embedBatch } from "./embed.js";
import { chunkText, guessLanguage, getSupportedExtensions } from "./ingest.js";

const db = new MemoryDB();
await db.initialize();

const server = new McpServer({
  name: "duckdb-memory",
  version: "1.0.0",
});

// ─── store ────────────────────────────────────────────────────────────────────
server.tool(
  "store",
  "Store text, code, or notes with vector embeddings for semantic search.",
  {
    content: z.string().describe("The text or code to store"),
    type: z
      .enum(["file", "snippet", "memory"])
      .default("snippet")
      .describe("Type of content"),
    metadata: z
      .record(z.unknown())
      .optional()
      .describe("Optional metadata (filepath, language, tags, etc.)"),
  },
  async ({ content, type, metadata }) => {
    const embedding = await embed(content);
    const id = await db.store(type, content, embedding, metadata || {});
    return {
      content: [
        {
          type: "text",
          text: `Stored as ${type} with id: ${id}`,
        },
      ],
    };
  }
);

// ─── search ───────────────────────────────────────────────────────────────────
server.tool(
  "search",
  "Semantic search across stored items. Finds similar content using vector embeddings.",
  {
    query: z.string().describe("Search query in natural language"),
    limit: z.number().default(5).describe("Max results to return"),
    type: z
      .enum(["file", "snippet", "memory"])
      .optional()
      .describe("Filter by content type"),
  },
  async ({ query, limit, type }) => {
    const queryEmbedding = await embed(query);
    const results = await db.search(queryEmbedding, limit, type);

    if (results.length === 0) {
      return {
        content: [{ type: "text", text: "No results found." }],
      };
    }

    const formatted = results
      .map(
        (r, i) =>
          `### ${i + 1}. [${r.type}] ${r.id} (similarity: ${(r.similarity! * 100).toFixed(1)}%)\n` +
          `**Metadata:** ${JSON.stringify(r.metadata)}\n` +
          `\`\`\`\n${r.content.slice(0, 500)}${r.content.length > 500 ? "..." : ""}\n\`\`\``
      )
      .join("\n\n");

    return {
      content: [{ type: "text", text: formatted }],
    };
  }
);

// ─── ingest_file ──────────────────────────────────────────────────────────────
server.tool(
  "ingest_file",
  "Read a file from disk, chunk it, and store with embeddings.",
  {
    filepath: z.string().describe("Path to the file to ingest"),
    projectRoot: z
      .string()
      .optional()
      .describe("Project root for relative path metadata"),
  },
  async ({ filepath, projectRoot }) => {
    const resolved = resolve(filepath);

    if (!existsSync(resolved)) {
      return {
        content: [{ type: "text", text: `File not found: ${resolved}` }],
        isError: true,
      };
    }

    const content = readFileSync(resolved, "utf-8");
    const relPath = projectRoot
      ? relative(resolve(projectRoot), resolved)
      : resolved;
    const language = guessLanguage(resolved);
    const chunks = chunkText(content);

    const embeddings = await embedBatch(chunks);
    const ids: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const id = await db.store("file", chunks[i], embeddings[i], {
        filepath: relPath,
        language,
        chunk: i,
        totalChunks: chunks.length,
      });
      ids.push(id);
    }

    return {
      content: [
        {
          type: "text",
          text: `Ingested ${relPath} (${language}) as ${chunks.length} chunk(s). IDs: ${ids.join(", ")}`,
        },
      ],
    };
  }
);

// ─── get ──────────────────────────────────────────────────────────────────────
server.tool(
  "get",
  "Retrieve a stored item by its ID.",
  {
    id: z.string().describe("The item ID"),
  },
  async ({ id }) => {
    const item = await db.getById(id);
    if (!item) {
      return {
        content: [{ type: "text", text: `No item found with id: ${id}` }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text:
            `**ID:** ${item.id}\n**Type:** ${item.type}\n**Created:** ${item.created_at}\n` +
            `**Metadata:** ${JSON.stringify(item.metadata)}\n\n` +
            `\`\`\`\n${item.content}\n\`\`\``,
        },
      ],
    };
  }
);

// ─── delete ───────────────────────────────────────────────────────────────────
server.tool(
  "delete",
  "Delete a stored item by its ID.",
  {
    id: z.string().describe("The item ID to delete"),
  },
  async ({ id }) => {
    await db.delete(id);
    return {
      content: [{ type: "text", text: `Deleted item: ${id}` }],
    };
  }
);

// ─── list ─────────────────────────────────────────────────────────────────────
server.tool(
  "list",
  "List stored items, most recent first.",
  {
    limit: z.number().default(20).describe("Max items to return"),
    offset: z.number().default(0).describe("Offset for pagination"),
  },
  async ({ limit, offset }) => {
    const items = await db.list(limit, offset);

    if (items.length === 0) {
      return {
        content: [{ type: "text", text: "No items stored yet." }],
      };
    }

    const formatted = items
      .map(
        (r) =>
          `- **[${r.type}]** ${r.id} — ${r.created_at}\n  ${r.content.slice(0, 100)}...`
      )
      .join("\n");

    return {
      content: [{ type: "text", text: formatted }],
    };
  }
);

// ─── stats ────────────────────────────────────────────────────────────────────
server.tool(
  "stats",
  "Show storage statistics — total items and breakdown by type.",
  {},
  async () => {
    const stats = await db.stats();
    const typeBreakdown = Object.entries(stats.byType)
      .map(([type, count]) => `  - ${type}: ${count}`)
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text:
            `**Total items:** ${stats.total}\n**By type:**\n${typeBreakdown || "  (none)"}`,
        },
      ],
    };
  }
);

// ─── ingest_directory ─────────────────────────────────────────────────────────
server.tool(
  "ingest_directory",
  "Ingest all supported source files from a directory (recursive).",
  {
    dirpath: z.string().describe("Path to the directory"),
    projectRoot: z
      .string()
      .optional()
      .describe("Project root (defaults to dirpath)"),
  },
  async ({ dirpath, projectRoot }) => {
    const { glob } = await import("glob");
    const root = resolve(projectRoot || dirpath);
    const extensions = getSupportedExtensions();
    const pattern = `${dirpath}/**/*{${extensions.join(",")}}`;

    const files = await glob(pattern, { nodir: true, dot: false });

    if (files.length === 0) {
      return {
        content: [
          { type: "text", text: "No supported source files found." },
        ],
      };
    }

    let totalChunks = 0;
    const results: string[] = [];

    for (const file of files) {
      try {
        const resolved = resolve(file);
        const content = readFileSync(resolved, "utf-8");
        const relPath = relative(root, resolved);
        const language = guessLanguage(resolved);
        const chunks = chunkText(content);
        const embeddings = await embedBatch(chunks);

        for (let i = 0; i < chunks.length; i++) {
          await db.store("file", chunks[i], embeddings[i], {
            filepath: relPath,
            language,
            chunk: i,
            totalChunks: chunks.length,
          });
        }

        totalChunks += chunks.length;
        results.push(`✓ ${relPath} (${chunks.length} chunks)`);
      } catch (err) {
        results.push(`✗ ${file}: ${err}`);
      }
    }

    return {
      content: [
        {
          type: "text",
          text:
            `Ingested ${files.length} files (${totalChunks} total chunks):\n\n${results.join("\n")}`,
        },
      ],
    };
  }
);

// ─── shutdown ─────────────────────────────────────────────────────────────────
process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});
process.on("SIGTERM", () => {
  db.close();
  process.exit(0);
});

// ─── start server ─────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
