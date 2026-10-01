import { ArrowRight } from "lucide-react";
import Link from "next/link";

type NextCategoryLinkProps = {
  name: string;
  slug: string;
};

export default function NextCategoryLink({ name, slug }: NextCategoryLinkProps) {
  return (
    <div className="flex flex-col justify-center items-center py-8">
      <span className="text-xs text-gray-700">Перейти далее в раздел</span>
      <Link
        href={`/catalog/${slug}`}
        className="inline-flex items-center gap-2 text-green-700 hover:text-green-700 hover:underline"
      >
        <span>{name}</span>
        <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
