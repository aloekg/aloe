"use client";

// A real href, so it still works before hydration; once hydrated it scrolls without a history entry —
// inside the quick view a #hash entry would make the sheet's router.back() remove the hash, not the sheet.
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

export default function ReviewsJumpLink({
  targetId,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  targetId: string;
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  return (
    <a
      href={`#${targetId}`}
      className={className}
      aria-label={ariaLabel}
      onClick={(e) => {
        const target = document.getElementById(targetId);
        if (!target) return;
        e.preventDefault();
        const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
        const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
        const scroller = scrollParent(target);
        // Not scrollIntoView: it also scrolls overflow-hidden ancestors, which shifted the sheet's panel.
        if (scroller) {
          const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
          scroller.scrollTo({ top: scroller.scrollTop + top - margin, behavior });
        } else {
          window.scrollTo({ top: window.scrollY + target.getBoundingClientRect().top - margin, behavior });
        }
      }}
    >
      {children}
    </a>
  );
}
