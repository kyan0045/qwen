export const USAGE = `qwen — unofficial TypeScript toolkit for Qwen models

Usage
  qwen "<prompt>"                 Ask a question (streams the answer)
  qwen                            Start a REPL
  ... | qwen --prompt "instruction"   Read stdin and ask about it
  qwen <command> [options]        See below

Commands
  models [--local] [--json]       List the Qwen model catalog (or what is installed locally)
  recommend [options] [--json]    Pick a Qwen model for a job
  pull <tag>                      Download a model via Ollama
  config                          Show which provider and credentials are in use

Options
  -m, --model <id>                Model id or Ollama tag (see \`qwen models\`)
  -p, --provider <name>           dashscope | dashscope-cn | openai | ollama | <baseURL>
  -s, --system <text>             System prompt
  -t, --temperature <n>           Sampling temperature
      --max-tokens <n>            Maximum tokens to generate
      --thinking                  Force thinking/reasoning mode on
      --no-thinking               Force thinking/reasoning mode off
      --thinking-budget <n>       Cap the reasoning token budget
      --enable-search             Let the model search the web (DashScope)
  -l, --local                     Prefer Ollama models; chat uses Ollama unless --provider is set
  -u, --use <task>                chat | coding | reasoning | translate | vision | embed
      --max-params <n>b           With recommend: cap total parameters, e.g. 32b
      --top <n>                   With recommend: how many matches to print
  -j, --json                      Machine-readable output
  -q, --quiet                     Print only the answer text
  -h, --help                      Show this help
  -v, --version                   Show the version

Environment
  QWEN_PROVIDER                   Default provider name
  QWEN_API_KEY / QWEN_BASE_URL    Fallback credentials
  DASHSCOPE_API_KEY               Alibaba Cloud Model Studio key
  OPENAI_API_KEY / OPENAI_BASE_URL
  OLLAMA_HOST                     Default http://localhost:11434
`;

export const REPL_HELP = `REPL commands
  /help            Show this help
  /model <id>      Switch model
  /thinking on|off Toggle thinking mode
  /system <text>   Set the system prompt
  /clear           Drop the conversation history
  /exit  /quit     Leave

Anything else is sent to the model. Ctrl+C clears the line, Ctrl+D exits.
`;
