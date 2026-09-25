import ReactMarkdown from "react-markdown";

// No rehype-raw: raw HTML in a description must stay dropped.
// Keep as a server component so the markdown parser never ships to the browser.
export default function ProductDescription({ text }: { text: string }) {
  return (
    <div className="prose prose-sm prose-gray max-w-none mb-6 text-gray-600">
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  );
}
