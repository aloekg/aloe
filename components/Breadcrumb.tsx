import Link from "next/link";

type Crumb = { label: string; href?: string };

export default function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Путь к разделу" className="text-sm text-gray-500 mb-6">
      <ol className="flex items-center gap-1.5 flex-wrap">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={i} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden>/</span>}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  aria-current={last ? "page" : undefined}
                  className="hover:text-gray-700 transition-colors"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-gray-600" aria-current={last ? "page" : undefined}>
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
