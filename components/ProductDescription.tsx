import ReactMarkdown from "react-markdown";

/**
 * A server component, deliberately: it has no state and no handlers, and both places that render
 * it — the product page and the quick view — are server components too. It used to be `"use client"`
 * with `react-markdown` behind `next/dynamic`, which shipped micromark and remark to the browser
 * (~33 KB gzipped on every product view) and had the description arrive a beat after the rest of
 * the sheet. Rendered here, the HTML is in the payload and the parser never leaves the server.
 *
 * No `rehype-raw`: raw HTML in a description is dropped, and `javascript:` hrefs are stripped by
 * react-markdown's own URL filter.
 */
export default function ProductDescription({ text }: { text: string }) {
  return (
    <div className="prose prose-sm prose-gray max-w-none mb-6 text-gray-600">
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  );
}
