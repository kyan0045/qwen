export const USAGE = `qwen: unofficial TypeScript toolkit for Qwen models

Usage
  qwen "<prompt>"                 Ask a question (streams the answer)
  qwen                            Start a REPL
  ... | qwen --prompt "instruction"   Read stdin and ask about it
  qwen <command> [options]        See below

Commands
  models [--local] [--json] [--use embed]   List the catalog (only qwen*/qwq* tags with --local)
  recommend [options] [--json]    Pick a Qwen model (--use, --local, --max-params, --top)
  pull <tag>                      Download a model via Ollama (requires Ollama)
  config [--provider] [--json]    Show which provider and credentials are in use

With no prompt and no subcommand, bare --use/--max-params/--top selects
recommend and bare --json/--local selects models; otherwise a REPL starts.

Options
  -m, --model <id>                Model id or Ollama tag (see \`qwen models\`)
  -p, --provider <name>           dashscope | dashscope-cn | openai | ollama | <baseURL>
  -s, --system <text>             System prompt
      --prompt <text>             Prompt text (cannot combine with positional words)
  -t, --temperature <n>           Sampling temperature
      --max-tokens <n>            Maximum tokens to generate
      --thinking                  Force thinking/reasoning mode on
      --no-thinking               Force thinking/reasoning mode off
      --thinking-budget <n>       Cap the reasoning token budget
      --enable-search             Let the model search the web (DashScope)
  -l, --local                     Prefer Ollama models; chat uses Ollama unless --provider is set
  -u, --use <task>                chat | coding | reasoning | vision | embed
      --max-params <n>[b]         With recommend: cap total parameters, e.g. 32b (t/m units allowed)
      --top <n>                   With recommend: how many matches to print
  -j, --json                      Machine-readable output (models/recommend/config/chat)
  -q, --quiet                     Print only the answer text on stdout (stats still go to stderr)
  -h, --help                      Show this help
  -v, --version                   Show the version

Environment
  QWEN_PROVIDER                   Default provider name
  QWEN_API_KEY                    Key for DashScope fallback and compatible hosts
  QWEN_BASE_URL                   Endpoint for compatible hosts and custom URLs
  DASHSCOPE_API_KEY               Alibaba Cloud Model Studio key
  DASHSCOPE_HTTP_BASE_URL         Override the DashScope endpoint
  OLLAMA_HOST                     Default http://localhost:11434
`;

export const REPL_HELP = `REPL commands
  /help            Show this help
  /model <id>      Switch model (single id, no spaces)
  /thinking on|off|auto  Thinking mode (bare /thinking toggles)
  /system <text>   Set the system prompt (empty clears it)
  /clear           Drop the conversation history
  /exit  /quit     Leave

Anything else is sent to the model. Start a line with // to send text
that begins with /. Ctrl+C clears the line, Ctrl+D exits.
`;
