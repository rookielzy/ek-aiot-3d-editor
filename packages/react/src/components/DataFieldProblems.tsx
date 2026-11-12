export function DataFieldProblems({ id, messages }: { id: string; messages: readonly string[] }) {
  if (messages.length === 0) return null;
  return (
    <ul id={id} className="ek-workbench__request-problems" role="alert">
      {[...new Set(messages)].map((message) => <li key={message}>{message}</li>)}
    </ul>
  );
}
