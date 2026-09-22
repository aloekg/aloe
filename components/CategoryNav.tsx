"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GiToothbrush } from "react-icons/gi";
import { PiHairDryer } from "react-icons/pi";
import { TbDiaper } from "react-icons/tb";
import {
  FlaskConical,
  HandHeart,
  HouseHeart,
  MirrorRound,
  Percent,
  Plus,
  Printer,
  ShowerHead,
  Star,
  Tag,
  WashingMachine,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import Container from "./Container";

const ICONS = {
  stirka: WashingMachine,
  bytovaya: FlaskConical,
  dom: HouseHeart,
  ofis: Printer,
  kosmetika: MirrorRound,
  podguzniki: TbDiaper,
  gigiena: ShowerHead,
  volosy: PiHairDryer,
  rot: GiToothbrush,
  telo: HandHeart,
};

// slug is plain text in the schema; ICONS is looked up defensively below.
type Category = { id: number; name: string; slug: string; parent_id: number | null };

const specials = [
  { href: "/popular", label: "Популярное", icon: Star },
  { href: "/new", label: "Новинки", icon: Plus },
  { href: "/sale", label: "Акции", icon: Percent },
  { href: "/brands", label: "Бренды", icon: Tag },
];

function NavItem({
  href,
  label,
  active,
  Icon,
}: {
  href: string;
  label: string;
  active?: boolean;
  Icon?: React.ElementType;
}) {
  return (
    <Link
      href={href}
      onNavigate={() => window.scrollTo(0, 0)}
      // Which category you are in was said by the dark circle and nothing else, so it was said only
      // to people who can see it — and colour alone is never allowed to carry information (1.4.1).
      aria-current={active ? "page" : undefined}
      className={`flex flex-col items-center gap-1.5 rounded-lg transition-colors shrink-0 w-18`}
    >
      <div
        className={`w-11 h-11 rounded-full ${active ? "bg-gray-700 text-green-500" : "bg-gray-100"} transition-colors flex items-center justify-center`}
      >
        {Icon ? <Icon className="size-5" /> : <div className="w-5 h-5 rounded bg-gray-300" />}
      </div>
      <span className="text-[11px] text-gray-700 text-center leading-tight line-clamp-2">{label}</span>
    </Link>
  );
}

export default function CategoryNav({ categories }: { categories: Category[] }) {
  const pathname = usePathname();
  const params = useParams();
  const activeParentSlug = params?.slug as string | undefined;

  const parents = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  // This nav lives in the root layout, so it is on every route. setState fired on every scroll
  // event and re-rendered all ~14 NavItems; React bails on an unchanged boolean, but the reads
  // below still force layout, so coalesce them into a frame.
  const frame = useRef<number | null>(null);
  const updateFades = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const el = scrollerRef.current;
      if (!el) return;
      setShowLeftFade(el.scrollLeft > 0);
      setShowRightFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    });
  }, []);

  useEffect(() => {
    updateFades();
    window.addEventListener("resize", updateFades);
    return () => {
      window.removeEventListener("resize", updateFades);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [parents.length, updateFades]);

  return (
    <nav className="hidden md:block h-25.5 bg-white sticky top-16 z-40">
      <Container className="relative">
        <div
          ref={scrollerRef}
          onScroll={updateFades}
          className="flex items-start gap-1.5 overflow-x-auto scrollbar-none pt-4 pb-2"
        >
          {specials.map((s) => (
            <NavItem key={s.href} href={s.href} label={s.label} active={pathname === s.href} Icon={s.icon} />
          ))}
          {parents.map((category) => (
            <NavItem
              key={category.id}
              href={`/catalog/${category.slug}`}
              label={category.name}
              active={activeParentSlug === category.slug}
              Icon={ICONS[category.slug as keyof typeof ICONS]}
            />
          ))}
        </div>
        <div
          className={`pointer-events-none absolute top-0 left-0 h-full w-8 bg-linear-to-r from-white to-transparent transition-opacity duration-200 ${showLeftFade ? "opacity-100" : "opacity-0"}`}
        />
        <div
          className={`pointer-events-none absolute top-0 right-0 h-full w-8 bg-linear-to-l from-white to-transparent transition-opacity duration-200 ${showRightFade ? "opacity-100" : "opacity-0"}`}
        />
      </Container>
    </nav>
  );
}
