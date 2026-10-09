import { ExternalLink as ExternalLinkIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { normalizeUrl } from "@/components/crm/explorerFormat";

/* =========================================================
   Link to a stored URL, opened in a new tab. The URL is
   normalised (www.x.de -> https://www.x.de) and only http(s)
   is allowed; anything else renders as plain text (or the
   fallback). Clicks do not trigger the surrounding row.
========================================================= */

export function ExternalLink({
  href,
  children,
  label,
  iconOnly = false,
  fallback = null,
  className,
}: {
  href: unknown;
  /** Text to show; defaults to the URL itself. */
  children?: React.ReactNode;
  /** Accessible name, e.g. "Open course page". */
  label?: string;
  iconOnly?: boolean;
  /** Rendered when the value is not a safe URL. */
  fallback?: React.ReactNode;
  className?: string;
}) {
  const url = normalizeUrl(href);
  if (!url) return <>{fallback}</>;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      aria-label={label ?? (iconOnly ? `Open ${url}` : undefined)}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "inline-flex max-w-full items-center gap-1 text-primary underline-offset-2 hover:underline",
        iconOnly ? "rounded p-1 hover:bg-accent" : "break-all",
        className,
      )}
    >
      {!iconOnly && (children ?? url)}
      <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0" />
    </a>
  );
}
