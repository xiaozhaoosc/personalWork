export default function Toast({ text }: { text: string }) {
  if (!text) return null;
  return <div className="toast">{text}</div>;
}
