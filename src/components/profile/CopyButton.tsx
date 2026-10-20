import { useEffect, useRef, useState } from 'preact/hooks';
import { copyText } from '../../lib/clipboard';

interface Props {
  text: string;
  /** What is being copied, for the accessible name and announcement, e.g. "GitHub value". */
  label: string;
  onResult: (message: string) => void;
  children?: string;
  class?: string;
}

export default function CopyButton({ text, label, onResult, children = 'Copy', class: className = '' }: Props) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function onClick() {
    const ok = await copyText(text);
    setState(ok ? 'copied' : 'failed');
    onResult(ok ? `Copied ${label}` : `Could not copy ${label}`);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 1600);
  }

  return (
    <button
      type="button"
      class={`btn btn-sm copy-btn ${state !== 'idle' ? `is-${state}` : ''} ${className}`}
      aria-label={`Copy ${label}`}
      onClick={onClick}
    >
      <span aria-hidden="true">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Failed' : children}</span>
    </button>
  );
}
