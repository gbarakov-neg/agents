const PALETTE = [
  { bg: 'bg-sky-500/20',      fg: 'text-sky-300',    dot: 'bg-sky-400' },      // 0 sky
  { bg: 'bg-emerald-500/20',  fg: 'text-emerald-300',dot: 'bg-emerald-400' },  // 1 emerald
  { bg: 'bg-amber-500/20',    fg: 'text-amber-300',  dot: 'bg-amber-400' },    // 2 amber
  { bg: 'bg-fuchsia-500/20',  fg: 'text-fuchsia-300',dot: 'bg-fuchsia-400' },  // 3 fuchsia
  { bg: 'bg-violet-500/20',   fg: 'text-violet-300', dot: 'bg-violet-400' },   // 4 violet
  { bg: 'bg-rose-500/20',     fg: 'text-rose-300',   dot: 'bg-rose-400' },     // 5 rose
  { bg: 'bg-lime-500/20',     fg: 'text-lime-300',   dot: 'bg-lime-400' },     // 6 lime
  { bg: 'bg-cyan-500/20',     fg: 'text-cyan-300',   dot: 'bg-cyan-400' },     // 7 cyan
];

// Role-stem → palette index. First match wins.
const ROLE_RULES: Array<[RegExp, number]> = [
  [/^product/i, 1],                                                       // product → emerald (green)
  [/^(frontend|ui|ux|react|vue|angular|css|html)/i, 0],                   // frontend → sky (blue)
  [/^(backend|api|server|node|python|fastapi|django|graphql)/i, 2],       // backend → amber (orange)
  [/^(devops|deploy|infra|cloud|kubernetes|terraform|docker|helm|platform)/i, 4], // infra → violet
  [/^(security|auth|threat)/i, 5],                                        // security → rose (red)
  [/^(test|qa|tdd|automat)/i, 6],                                         // test → lime
  [/^(data|database|postgres|mongodb|sql)/i, 7],                          // data → cyan
  [/^(ai|ml|llm|agent)/i, 3],                                             // ai → fuchsia
  [/^(architect|design)/i, 4],                                            // architect → violet
  [/^(review|perf|performance)/i, 5],                                     // review/perf → rose
];

export function agentColor(key: string): typeof PALETTE[number] {
  for (const [re, idx] of ROLE_RULES) {
    if (re.test(key)) return PALETTE[idx];
  }
  // Fallback: deterministic hash for unknown roles
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
