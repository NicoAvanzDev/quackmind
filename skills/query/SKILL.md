---
description: Semantic search across stored memories, code, and files
---

# Query Skill

Search the semantic memory database using natural language.

## Usage

Use the MCP tool `search` to find similar content:

```
search(query: string, limit?: number, type?: "file" | "snippet" | "memory")
```

## When to use

- User asks about something they've seen before
- User wants to find similar code patterns
- User asks "how did I do X" or "what was that thing about"
- Cross-referencing stored knowledge

## Example prompts that trigger this skill

- "How did I implement authentication?"
- "Find code similar to this"
- "What do I know about X?"
- "Search my notes for..."
