import Link from "next/link";
import { LEGACY_SITE_URL } from "@/lib/constants";
import Container from "./Container";
import Logo from "./header/Logo";

const links = [
  { href: "/delivery", label: "Доставка" },
  { href: "/about", label: "О нас" },
  { href: "/contacts", label: "Контакты" },
  { href: "/legal-entities", label: "Для юр лиц" },
];

export default function Footer() {
  return (
    <footer className="mt-auto bg-green-50 pb-20 md:pb-6 pt-6">
      <Container className="flex flex-col md:flex-row items-center justify-center md:justify-between gap-4">
        <Logo />

        <nav aria-label="Разделы сайта" className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-gray-600">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-green-700 transition-colors">
              {link.label}
            </Link>
          ))}

          <a href={LEGACY_SITE_URL} rel="nofollow" className="hover:text-green-700 transition-colors">
            Перейти на старую версию сайта
          </a>
        </nav>

        <span className="text-sm text-gray-500">© {new Date().getFullYear()} Aloe.kg</span>
      </Container>
    </footer>
  );
}
