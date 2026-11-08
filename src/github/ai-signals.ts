// What can be found in a repository that points at AI assistants. Each rule
// looks for a fixed, named thing (a trailer, a file, a topic) and reports only
// the assistant's name from a fixed list. Nothing here reads or keeps text
// written by third parties beyond matching it.

/** The assistants whose co-author trailer is recognized, with the words that identify them. */
const ASSISTANTS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: "Claude", pattern: /claude|anthropic/i },
  { name: "GitHub Copilot", pattern: /copilot/i },
  { name: "Cursor", pattern: /cursor/i },
  { name: "OpenAI", pattern: /codex|openai|chatgpt/i },
  { name: "Gemini", pattern: /gemini/i },
];

const TRAILER = /^co-authored-by:\s*(.+)$/gim;

/**
 * The assistants named as co-authors in a commit message. Only trailer lines
 * are read: the same word in the body of the message does not count.
 */
export function coauthorAssistants(message: string): string[] {
  const found = new Set<string>();
  for (const [, who = ""] of message.matchAll(TRAILER)) {
    for (const assistant of ASSISTANTS) {
      if (assistant.pattern.test(who)) found.add(assistant.name);
    }
  }
  return [...found].sort();
}

const CONFIG_FILES: readonly {
  readonly tool: string;
  readonly matches: (path: string) => boolean;
}[] = [
  { tool: "Claude Code", matches: (p) => p === "CLAUDE.md" || p.startsWith(".claude/") },
  { tool: "AGENTS.md", matches: (p) => p === "AGENTS.md" },
  { tool: "Cursor", matches: (p) => p === ".cursorrules" || p.startsWith(".cursor/") },
  { tool: "GitHub Copilot", matches: (p) => p === ".github/copilot-instructions.md" },
  { tool: "Gemini CLI", matches: (p) => p === "GEMINI.md" },
  { tool: "Windsurf", matches: (p) => p === ".windsurfrules" },
];

/** The assistants that have a configuration file in the repository, in alphabetical order. */
export function detectToolFiles(paths: readonly string[]): string[] {
  return CONFIG_FILES.filter((rule) => paths.some(rule.matches))
    .map((rule) => rule.tool)
    .sort();
}

/** Topics that say a repository is about AI engineering, and what each one suggests. */
const AI_TOPICS: Readonly<Record<string, string>> = {
  llm: "LLM",
  llms: "LLM",
  rag: "RAG",
  "retrieval-augmented-generation": "RAG",
  agents: "AI agents",
  "ai-agents": "AI agents",
  "multi-agent": "AI agents",
  mcp: "MCP",
  "function-calling": "Function calling",
  "tool-use": "Tool use",
  embeddings: "Embeddings",
  "vector-database": "Vector search",
  "vector-search": "Vector search",
  "prompt-engineering": "Prompt engineering",
  langchain: "LangChain",
  openai: "OpenAI API",
  anthropic: "Anthropic API",
  "generative-ai": "Generative AI",
};

/** The AI-related topics of a repository, as readable names, without repeats. */
export function aiTopics(topics: readonly string[]): string[] {
  return [...new Set(topics.flatMap((topic) => AI_TOPICS[topic.toLowerCase()] ?? []))].sort();
}
