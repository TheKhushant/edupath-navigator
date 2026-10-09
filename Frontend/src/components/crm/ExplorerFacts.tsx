import { cn } from "@/lib/utils";
import { looksLikeUrl, type Fact } from "@/components/crm/explorerFormat";
import { ExternalLink } from "@/components/crm/ExternalLink";

/** Label/value grid and bullet list used by the explorer details and the student presentation. */
export function FactList({ items, className }: { items: Fact[]; className?: string }) {
  if (!items.length) return null;

  return (
    <dl className={cn("grid gap-2 sm:grid-cols-2", className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="min-w-0 rounded-md border border-line/60 bg-secondary/30 px-3 py-2"
        >
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </dt>
          <dd className="mt-0.5 break-words text-sm font-medium">
            {looksLikeUrl(item.value) ? <ExternalLink href={item.value} /> : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function BulletList({ items }: { items: string[] }) {
  if (!items.length) return null;

  return (
    <ul className="grid gap-1 text-sm">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
