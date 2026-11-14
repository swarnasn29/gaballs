import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

/** Solid card: everything with numbers or rules sits on one of these (never on the sky). */
export function Card({ className, children, ...rest }: ComponentProps<'section'>) {
  return (
    <section
      className={cx('glass rounded-[2rem] p-5 text-ink shadow-chunky sm:p-6', className)}
      {...rest}
    >
      {children}
    </section>
  );
}

type ButtonProps = ComponentProps<'button'> & { variant?: 'primary' | 'secondary' | 'ghost' };

export function Button({ variant = 'primary', className, ...rest }: ButtonProps) {
  return (
    <button
      className={cx(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 font-display text-lg font-semibold',
        'transition-transform active:translate-y-1 disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'primary' && 'bg-grape text-white shadow-chunky-ink hover:brightness-110',
        variant === 'secondary' && 'bg-blush text-accent shadow-chunky ring-2 ring-lilac hover:bg-white/15',
        variant === 'ghost' && 'text-accent underline-offset-4 hover:underline',
        className,
      )}
      {...rest}
    />
  );
}

/**
 * A number with a link to where it came from: `/raw` shows the live JSON of that exact view call.
 * (CLAUDE.md §5: every number shown links to its source.)
 */
export function Stat({
  label,
  value,
  source,
  className,
}: {
  label: string;
  value: ReactNode;
  /** A view call (shown live on /raw), or an external link such as an explorer page. */
  source: { contract: string; method: string; args?: object } | { href: string; label: string };
  className?: string;
}) {
  const href =
    'href' in source
      ? source.href
      : `/raw?${new URLSearchParams({ contract: source.contract, method: source.method, args: JSON.stringify(source.args ?? {}) })}`;
  const sourceLabel = 'href' in source ? source.label : `${source.method}()`;
  return (
    <div className={cx('rounded-2xl bg-blush px-3 py-2', className)}>
      <dt className="text-xs font-bold uppercase tracking-wide text-plum">{label}</dt>
      <dd className="font-display text-xl font-semibold text-ink">{value}</dd>
      <Link href={href} className="text-[11px] font-semibold text-accent underline-offset-2 hover:underline">
        source: {sourceLabel}
      </Link>
    </div>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center rounded-full bg-blush px-3 py-1 text-sm font-bold text-accent', className)}>
      {children}
    </span>
  );
}

export { cx };
