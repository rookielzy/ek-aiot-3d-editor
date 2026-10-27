import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import { DataBindingForm } from "./DataBindingForm";

export function DataBindingInspector({ context }: { context: ResolvedWorkbenchContext }) {
  const t = context.i18n.t;
  const { selection, snapshot } = context;
  const node = selection.nodeId ? snapshot.nodes[selection.nodeId] ?? null : null;

  let content;
  if (selection.count === 0 || !node) {
    content = <p className="ek-inspector-empty">{t("dataBinding.empty.selection")}</p>;
  } else if (selection.count > 1) {
    content = <p className="ek-inspector-empty">{t("dataBinding.empty.multi")}</p>;
  } else if (node.kind === "object") {
    content = <DataBindingForm key={node.id} context={context} objectNodeId={node.id} />;
  } else if (node.kind === "imported") {
    const owner = Object.values(snapshot.nodes).find((candidate) =>
      candidate.kind === "object" && candidate.objectId === node.ownerObjectId
    );
    content = (
      <div className="ek-workbench__binding-unsupported">
        <p className="ek-inspector-empty">{t("dataBinding.unsupported.imported")}</p>
        {owner ? (
          <button
            type="button"
            onClick={() => context.dispatch({ type: "select-node", nodeId: owner.id })}
          >{t("dataBinding.unsupported.importedOwner", { name: owner.name })}</button>
        ) : (
          <small>{t("dataBinding.unsupported.ownerUnavailable")}</small>
        )}
      </div>
    );
  } else {
    const unsupportedKey = node.kind === "group"
      ? "dataBinding.unsupported.group"
      : node.kind === "light"
        ? "dataBinding.unsupported.light"
        : "dataBinding.unsupported.camera";
    content = (
      <p className="ek-inspector-empty">{t(unsupportedKey)}</p>
    );
  }

  return (
    <section className="ek-inspector-section">
      <header className="ek-inspector-section__header">
        <h2>{t("dataBinding.section.label")}</h2>
      </header>
      {content}
    </section>
  );
}
