import { AlertTriangle } from 'lucide-react';

/** A visible boundary for form details that have no approved operational API. */
export function ContractBoundaryNotice({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      role="status"
      aria-label={`Status blocked: ${title}`}
      className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
    >
      <h3 className="flex items-center gap-2 font-extrabold">
        <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
        <span>BLOCKED · {title}</span>
      </h3>
      <div className="mt-2 leading-6">{children}</div>
    </section>
  );
}
