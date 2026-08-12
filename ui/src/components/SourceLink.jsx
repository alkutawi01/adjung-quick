// SourceLink — presentation-only, per ChatGPT's explicit instruction:
// "URL disimpan dalam data, tetapi URL tidak menjadi kandungan visual Quick."
// label = source name, href = source's original URL. No business logic.
export default function SourceLink({ name, href }) {
  if (!href) return <span className="source-link source-link--unavailable">{name}</span>;
  return (
    <a className="source-link" href={href} target="_blank" rel="noopener noreferrer">
      {name}
    </a>
  );
}
