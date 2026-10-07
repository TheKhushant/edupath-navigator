import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Building2, Printer, Sparkles } from "lucide-react";

import { explorerService } from "@/services/crmServices";
import { parsePresentationSearch } from "@/lib/explorerParams";
import type { ExplorerItems } from "@/types/crm";
import {
  courseFacts,
  courseLocation,
  courseUniversityName,
  courseUrl,
  filled,
  listFilled,
  safeUrl,
  universityFacts,
  universityLocation,
} from "@/components/crm/explorerFormat";
import { BulletList, FactList } from "@/components/crm/ExplorerFacts";
import { Button } from "@/components/ui/button";

/* =========================================================
   STUDENT PRESENTATION (/explorer/present)
   Client-friendly, printable summary of shortlisted options.
   Everything is read from the URL ids, so the link can be
   shared and reopened.
========================================================= */

const splitIds = (value?: string) =>
  (value ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

function OptionCard({
  icon,
  title,
  subtitle,
  link,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  link?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <article className="break-inside-avoid rounded-xl border border-line/60 bg-card p-5 shadow-sm print:shadow-none">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold leading-snug">{title}</h3>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="mt-4 grid gap-4">{children}</div>
      {link && (
        <p className="mt-4 text-sm">
          <a
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-brand underline-offset-2 hover:underline"
          >
            {link.label}
          </a>
          <span className="hidden break-all text-muted-foreground print:inline">
            {" "}
            ({link.href})
          </span>
        </p>
      )}
    </article>
  );
}

export function ExplorerPresentation() {
  const rawSearch = useSearch({ strict: false }) as Record<string, unknown>;
  const params = useMemo(() => parsePresentationSearch(rawSearch), [rawSearch]);
  const universityIds = splitIds(params.universities);
  const courseIds = splitIds(params.courses);
  const idsKey = `${universityIds.join(",")}|${courseIds.join(",")}`;

  const [items, setItems] = useState<ExplorerItems | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!universityIds.length && !courseIds.length) {
      setError("This presentation link has no universities or courses.");
      return;
    }

    let cancelled = false;
    explorerService
      .getItems({ universities: universityIds, courses: courseIds })
      .then((result) => !cancelled && setItems(result))
      .catch(
        (loadError) =>
          !cancelled && setError(loadError instanceof Error ? loadError.message : "Unable to load"),
      );

    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  const today = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-background text-foreground print:bg-white">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Button asChild variant="ghost" size="sm">
            <Link to="/explorer">
              <ArrowLeft /> Explorer
            </Link>
          </Button>
          <Button size="sm" onClick={() => window.print()} disabled={!items}>
            <Printer /> Print / save as PDF
          </Button>
        </div>

        <header className="mb-8 border-b border-line/60 pb-6">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-brand-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold">SS Overseas</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {params.student ? `Study options for ${params.student}` : "Your study options"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Prepared on {today}</p>
        </header>

        {error && (
          <p className="rounded-lg border border-line/60 p-6 text-center text-sm">{error}</p>
        )}
        {!items && !error && (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}

        {items && (
          <div className="grid gap-10">
            {items.courses.length > 0 && (
              <section className="grid gap-4">
                <h2 className="text-lg font-semibold">Courses ({items.courses.length})</h2>
                {items.courses.map((course) => {
                  const href = courseUrl(course);
                  return (
                    <OptionCard
                      key={course._id}
                      icon={<BookOpen className="h-5 w-5" />}
                      title={course.courseName}
                      subtitle={[courseUniversityName(course), courseLocation(course)]
                        .filter(filled)
                        .join(" · ")}
                      {...(href ? { link: { href, label: "Course page" } } : {})}
                    >
                      <FactList items={courseFacts(course)} />
                      {(filled(course.eligibility) ||
                        listFilled(course.requirements).length > 0) && (
                        <div className="grid gap-2">
                          <h4 className="text-sm font-semibold">Admission requirements</h4>
                          {filled(course.eligibility) && (
                            <p className="text-sm">{course.eligibility}</p>
                          )}
                          <BulletList items={listFilled(course.requirements)} />
                        </div>
                      )}
                    </OptionCard>
                  );
                })}
              </section>
            )}

            {items.universities.length > 0 && (
              <section className="grid gap-4">
                <h2 className="text-lg font-semibold">
                  Universities ({items.universities.length})
                </h2>
                {items.universities.map((university) => {
                  const href = safeUrl(university.website);
                  const requirements = [
                    ...listFilled(university.requirements),
                    ...listFilled(university.documents),
                  ];
                  return (
                    <OptionCard
                      key={university._id}
                      icon={<Building2 className="h-5 w-5" />}
                      title={university.name}
                      subtitle={universityLocation(university)}
                      {...(href ? { link: { href, label: "University website" } } : {})}
                    >
                      {filled(university.description) && (
                        <p className="text-sm">{university.description}</p>
                      )}
                      <FactList
                        items={universityFacts(university).filter(
                          (item) => item.label !== "Location",
                        )}
                      />
                      {listFilled(university.popularCourses).length > 0 && (
                        <p className="text-sm">
                          <span className="font-semibold">Popular courses: </span>
                          {listFilled(university.popularCourses).join(", ")}
                        </p>
                      )}
                      {requirements.length > 0 && (
                        <div className="grid gap-2">
                          <h4 className="text-sm font-semibold">Admission requirements</h4>
                          <BulletList items={requirements} />
                        </div>
                      )}
                    </OptionCard>
                  );
                })}
              </section>
            )}

            {items.courses.length + items.universities.length === 0 && (
              <p className="rounded-lg border border-line/60 p-6 text-center text-sm">
                These options are no longer available.
              </p>
            )}

            <footer className="border-t border-line/60 pt-6 text-xs text-muted-foreground">
              Fees, deadlines and requirements change every intake. Please confirm the details on
              the university's official page before applying. Your SS Overseas counsellor will help
              you with the application.
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
