/**
 * DuckDB connection and schema management for vector storage.
 */

import { DuckDBInstance, DuckDBConnection } from "@duckdb/node-api";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface StoredItem {
  id: string;
  type: "file" | "snippet" | "memory";
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
  similarity?: number;
}

export class MemoryDB {
  private instance: DuckDBInstance | null = null;
  private conn: DuckDBConnection | null = null;
  private dbPath: string;

  constructor(dbPath: string = ".duckdb-memory/memory.duckdb") {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.instance = await DuckDBInstance.create(this.dbPath);
    this.conn = await this.instance.connect();

    // Load VSS extension for vector similarity search
    await this.conn.run("INSTALL vss");
    await this.conn.run("LOAD vss");

    // Create items table with vector column
    await this.conn.run(`
      CREATE TABLE IF NOT EXISTS items (
        id VARCHAR PRIMARY KEY,
        type VARCHAR NOT NULL,
        content TEXT NOT NULL,
        metadata JSON DEFAULT '{}',
        embedding FLOAT[384],
        created_at TIMESTAMP DEFAULT current_timestamp
      )
    `);

    // Create HNSW index for fast vector search
    try {
      await this.conn.run(`
        CREATE INDEX IF NOT EXISTS idx_items_embedding
        ON items USING HNSW (embedding)
      `);
    } catch {
      // Index may already exist
    }
  }

  async store(
    type: string,
    content: string,
    embedding: number[],
    metadata: Record<string, unknown> = {}
  ): Promise<string> {
    if (!this.conn) throw new Error("Database not initialized");

    const id = randomUUID();

    const stmt = await this.conn.prepare(
      "INSERT INTO items (id, type, content, metadata, embedding) VALUES (?, ?, ?, ?::JSON, ?::FLOAT[384])"
    );
    stmt.bindVarchar(1, id);
    stmt.bindVarchar(2, type);
    stmt.bindVarchar(3, content);
    stmt.bindVarchar(4, JSON.stringify(metadata));
    stmt.bindVarchar(5, `[${embedding.join(", ")}]`);
    await stmt.run();
    stmt.destroySync();

    return id;
  }

  async search(
    queryEmbedding: number[],
    limit: number = 10,
    type?: string
  ): Promise<StoredItem[]> {
    if (!this.conn) throw new Error("Database not initialized");

    const embStr = `[${queryEmbedding.join(", ")}]`;
    let sql = `
      SELECT id, type, content, metadata, created_at,
             array_distance(embedding, ${this.escapeLiteral(embStr)}::FLOAT[384]) AS distance
      FROM items
    `;

    if (type) {
      sql += ` WHERE type = ${this.escapeLiteral(type)}`;
    }

    sql += ` ORDER BY distance ASC LIMIT ${limit}`;

    const reader = await this.conn.runAndReadAll(sql);
    const rows = reader.getRows();

    return rows.map((row) => ({
      id: row[0] as string,
      type: row[1] as StoredItem["type"],
      content: row[2] as string,
      metadata: JSON.parse((row[3] as string) || "{}"),
      created_at: row[4] as string,
      similarity: 1 - (row[5] as number),
    }));
  }

  async getById(id: string): Promise<StoredItem | null> {
    if (!this.conn) throw new Error("Database not initialized");

    const stmt = await this.conn.prepare(
      "SELECT id, type, content, metadata, created_at FROM items WHERE id = ?"
    );
    stmt.bindVarchar(1, id);
    const reader = await stmt.runAndReadAll();
    stmt.destroySync();

    const rows = reader.getRows();
    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      id: row[0] as string,
      type: row[1] as StoredItem["type"],
      content: row[2] as string,
      metadata: JSON.parse((row[3] as string) || "{}"),
      created_at: row[4] as string,
    };
  }

  async delete(id: string): Promise<boolean> {
    if (!this.conn) throw new Error("Database not initialized");

    const stmt = await this.conn.prepare("DELETE FROM items WHERE id = ?");
    stmt.bindVarchar(1, id);
    await stmt.run();
    stmt.destroySync();

    return true;
  }

  async list(limit: number = 50, offset: number = 0): Promise<StoredItem[]> {
    if (!this.conn) throw new Error("Database not initialized");

    const stmt = await this.conn.prepare(
      "SELECT id, type, content, metadata, created_at FROM items ORDER BY created_at DESC LIMIT ? OFFSET ?"
    );
    stmt.bindInteger(1, limit);
    stmt.bindInteger(2, offset);
    const reader = await stmt.runAndReadAll();
    stmt.destroySync();

    const rows = reader.getRows();
    return rows.map((row) => ({
      id: row[0] as string,
      type: row[1] as StoredItem["type"],
      content: row[2] as string,
      metadata: JSON.parse((row[3] as string) || "{}"),
      created_at: row[4] as string,
    }));
  }

  async stats(): Promise<{ total: number; byType: Record<string, number> }> {
    if (!this.conn) throw new Error("Database not initialized");

    const totalReader = await this.conn.runAndReadAll(
      "SELECT COUNT(*) FROM items"
    );
    const total = Number(totalReader.getRows()[0][0]);

    const byTypeReader = await this.conn.runAndReadAll(
      "SELECT type, COUNT(*) FROM items GROUP BY type"
    );
    const byType: Record<string, number> = {};
    for (const row of byTypeReader.getRows()) {
      byType[row[0] as string] = Number(row[1]);
    }

    return { total, byType };
  }

  close(): void {
    // DuckDB Node Neo uses disconnectSync / closeSync
    if (this.conn) {
      (this.conn as any).disconnectSync?.() ?? (this.conn as any).closeSync?.();
      this.conn = null;
    }
    if (this.instance) {
      (this.instance as any).closeSync?.();
      this.instance = null;
    }
  }

  private escapeLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }
}
