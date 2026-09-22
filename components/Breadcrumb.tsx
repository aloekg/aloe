import Link from "next/link";

type Crumb = { label: string; href?: string };

export default function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="flex text-sm text-gray-500 mb-6 items-center gap-1.5 flex-wrap">
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span>/</span>}
          {crumb.href ? (
            <Link href={crumb.href} className="hover:text-gray-700 transition-colors">
              {crumb.label}
            </Link>
          ) : (
            <span className="text-gray-600">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
