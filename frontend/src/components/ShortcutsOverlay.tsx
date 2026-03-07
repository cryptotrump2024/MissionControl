// frontend/src/components/ShortcutsOverlay.tsx
interface Props {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ['g', 'd'], description: 'Go to Dashboard' },
  { keys: ['g', 'a'], description: 'Go to Agents' },
  { keys: ['g', 't'], description: 'Go to Tasks' },
  { keys: ['g', 'l'], description: 'Go to Logs' },
  { keys: ['g', 'c'], description: 'Go to Costs' },
  { keys: ['g', 'x'], description: 'Go to Alerts' },
  { keys: ['n', 't'], description: 'New Task' },
  { keys: ['⌘K'], description: 'Command Palette' },
  { keys: ['?'], description: 'Show Shortcuts' },
  { keys: ['Esc'], description: 'Close / Cancel' },
];

export default function ShortcutsOverlay({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-mc-bg-secondary border border-mc-border-primary rounded-xl p-6 w-80 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-mc-text-primary">Keyboard Shortcuts</h3>
          <button className="text-mc-text-muted hover:text-mc-text-primary" onClick={onClose}>✕</button>
        </div>
        <div className="space-y-2">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-mc-text-secondary">{s.description}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, j) => (
                  <span
                    key={j}
                    className="bg-mc-bg-tertiary border border-mc-border-primary rounded px-1.5 py-0.5 font-mono text-mc-text-primary text-[10px]"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-mc-text-muted mt-4 text-center">
          Press{' '}
          <span className="font-mono bg-mc-bg-tertiary px-1 rounded">?</span>{' '}
          to toggle this overlay
        </p>
      </div>
    </div>
  );
}
