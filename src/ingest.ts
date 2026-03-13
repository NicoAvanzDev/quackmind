/**
 * File and snippet ingestion — chunking and processing.
 */

/**
 * Split text into overlapping chunks for embedding.
 * Keeps chunks under maxChars with overlap for context continuity.
 */
export function chunkText(
  text: string,
  maxChars: number = 1000,
  overlap: number = 200
): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChars;

    // Try to break at a natural boundary
    if (end < text.length) {
      // Look for newline boundaries first, then spaces
      const chunk = text.slice(start, end);
      const lastNewline = chunk.lastIndexOf("\n");
      const lastSpace = chunk.lastIndexOf(" ");

      if (lastNewline > maxChars * 0.5) {
        end = start + lastNewline;
      } else if (lastSpace > maxChars * 0.5) {
        end = start + lastSpace;
      }
    } else {
      end = text.length;
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlap;

    if (start >= text.length) break;
  }

  return chunks.filter((c) => c.length > 0);
}

/**
 * Guess the language/type from a file path.
 */
export function guessLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rb: "ruby",
    rs: "rust",
    go: "go",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    sql: "sql",
    md: "markdown",
    mdx: "markdown",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    html: "html",
    css: "css",
    scss: "scss",
    toml: "toml",
    dockerfile: "dockerfile",
    tf: "hcl",
  };

  // Check for special filenames
  const basename = filePath.split("/").pop()?.toLowerCase() || "";
  if (basename === "dockerfile") return "dockerfile";
  if (basename === "makefile") return "makefile";

  return langMap[ext] || "text";
}

/**
 * Get supported file extensions for auto-ingestion.
 */
export function getSupportedExtensions(): string[] {
  return [
    ".ts", ".tsx", ".js", ".jsx",
    ".py", ".rb", ".rs", ".go",
    ".java", ".c", ".cpp", ".h", ".hpp",
    ".cs", ".php", ".swift", ".kt",
    ".sh", ".sql", ".md", ".json",
    ".yaml", ".yml", ".toml", ".tf",
  ];
}
