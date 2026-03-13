---
description: Store text, code, or notes into DuckDB with vector embeddings
---

# Store Skill

Store content into the semantic memory database.

## Usage

Use the MCP tool `store` to save content:

```
store(content: string, type: "file" | "snippet" | "memory", metadata?: object)
```

## When to use

- User wants to save a code snippet for later
- User wants to remember a solution or pattern
- Storing notes or decisions
- Saving important file contents

## Example prompts that trigger this skill

- "Remember this snippet: ..."
- "Store this for later"
- "Save this code pattern"
- "Add this to memory"
