const PALETTE = [
  { bg: 'bg-sky-500/20',      fg: 'text-sky-300',    dot: 'bg-sky-400' },
  { bg: 'bg-emerald-500/20',  fg: 'text-emerald-300',dot: 'bg-emerald-400' },
  { bg: 'bg-amber-500/20',    fg: 'text-amber-300',  dot: 'bg-amber-400' },
  { bg: 'bg-fuchsia-500/20',  fg: 'text-fuchsia-300',dot: 'bg-fuchsia-400' },
  { bg: 'bg-violet-500/20',   fg: 'text-violet-300', dot: 'bg-violet-400' },
  { bg: 'bg-rose-500/20',     fg: 'text-rose-300',   dot: 'bg-rose-400' },
  { bg: 'bg-lime-500/20',     fg: 'text-lime-300',   dot: 'bg-lime-400' },
  { bg: 'bg-cyan-500/20',     fg: 'text-cyan-300',   dot: 'bg-cyan-400' },
];

export function agentColor(key: string): typeof PALETTE[number] {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
