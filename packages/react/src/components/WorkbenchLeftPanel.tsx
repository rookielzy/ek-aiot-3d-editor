import { useState, type ChangeEvent, type CSSProperties } from "react";
import type { WorkbenchHierarchyRow, WorkbenchMissingAssetItem } from "@ek-aiot/3d-editor-core";
import type { WorkbenchContext } from "../hooks/use-workbench";

export interface WorkbenchLeftPanelProps {
  context: WorkbenchContext;
}

type AssetRecoveryState = Record<string, string>;

export function WorkbenchLeftPanel({ context }: WorkbenchLeftPanelProps) {
  const [recoveryState, setRecoveryState] = useState<AssetRecoveryState>({});
  const model = context.model;

  async function replaceMissingAsset(item: WorkbenchMissingAssetItem, event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    setRecoveryState((current) => ({ ...current, [item.problemId]: "Replacing..." }));
    const result = await context.replaceAsset({
      assetId: item.assetId,
      source: file,
      label: file.name,
      mimeType: file.type
    });
    if (result.ok) {
      await context.runtime?.project();
      context.refreshProblems();
      setRecoveryState((current) => ({ ...current, [item.problemId]: `Replaced with ${file.name}` }));
      return;
    }

    setRecoveryState((current) => ({
      ...current,
      [item.problemId]: result.problems[0]?.message ?? "Replacement failed"
    }));
  }

  return (
    <div className="ek-workbench__default-left-panel">
      <section className="ek-workbench__panel-section" aria-label="Hierarchy">
        <div className="ek-workbench__section-header">
          <h2>Hierarchy</h2>
          <span>{model.hierarchy.totalCount}</span>
        </div>
        {model.hierarchy.empty ? (
          <p className="ek-workbench__empty">No scene nodes.</p>
        ) : (
          <ul className="ek-workbench__tree">
            {model.hierarchy.roots.map((row) => (
              <WorkbenchNodeRow key={row.id} context={context} row={row} />
            ))}
          </ul>
        )}
      </section>

      <section className="ek-workbench__panel-section" aria-label="Assets">
        <div className="ek-workbench__section-header">
          <h2>Assets</h2>
          <span>{model.assets.totalCount}</span>
        </div>
        {model.assets.empty ? (
          <p className="ek-workbench__empty">No registered assets.</p>
        ) : (
          <ul className="ek-workbench__asset-list">
            {model.assets.items.map((asset) => (
              <li key={asset.id} data-missing={asset.missing ? "true" : undefined} data-severity={asset.highestProblemSeverity ?? undefined}>
                <span>{asset.label}</span>
                <small>
                  {asset.kind}
                  {asset.referenced ? " · referenced" : " · unused"}
                  {asset.problemCount ? ` · ${asset.problemCount} problems` : ""}
                </small>
              </li>
            ))}
          </ul>
        )}
        {model.assets.missing.length > 0 ? (
          <div className="ek-workbench__recovery-list" aria-label="Missing asset recovery">
            {model.assets.missing.map((item) => (
              <label key={item.problemId} className="ek-workbench__file-action" data-severity={item.severity}>
                <span>{item.actionLabel ?? "Replace asset"}</span>
                <strong>{item.label}</strong>
                <small>{recoveryState[item.problemId] ?? item.title}</small>
                <input type="file" onChange={(event) => void replaceMissingAsset(item, event)} />
              </label>
            ))}
          </div>
        ) : null}
      </section>

      <section className="ek-workbench__panel-section" aria-label="Project">
        <div className="ek-workbench__section-header">
          <h2>Project</h2>
          <span>{model.project.statusLabel}</span>
        </div>
        <dl className="ek-workbench__summary-list">
          <div>
            <dt>Scene</dt>
            <dd>{model.project.sceneName}</dd>
          </div>
          <div>
            <dt>Nodes</dt>
            <dd>{model.project.nodeCount}</dd>
          </div>
          <div>
            <dt>Objects</dt>
            <dd>{model.project.objectCount}</dd>
          </div>
          <div>
            <dt>Lights</dt>
            <dd>{model.project.lightCount}</dd>
          </div>
          <div>
            <dt>Assets</dt>
            <dd>{model.project.assetCount}</dd>
          </div>
        </dl>
        {model.problems.totalCount > 0 ? (
          <ul className="ek-workbench__problem-list" aria-label="Project problems">
            {model.problems.items.slice(0, 4).map((problem) => (
              <li key={problem.id} data-severity={problem.severity}>
                <span>{problem.title}</span>
                <small>
                  {problem.severity}
                  {problem.assetId ? ` · ${problem.assetId}` : ""}
                  {problem.actionLabel ? ` · ${problem.actionLabel}` : ""}
                </small>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

function WorkbenchNodeRow({ context, row }: { context: WorkbenchContext; row: WorkbenchHierarchyRow }) {
  const children = row.childIds
    .map((childId) => context.model.hierarchy.rows.find((candidate) => candidate.id === childId))
    .filter((child): child is WorkbenchHierarchyRow => Boolean(child));

  return (
    <li>
      <button
        type="button"
        className="ek-workbench__tree-row"
        data-selected={row.selected ? "true" : undefined}
        data-severity={row.highestProblemSeverity ?? undefined}
        onClick={() => context.dispatch({ type: "select-node", nodeId: row.id })}
        style={{ "--ek-workbench-tree-depth": row.depth } as CSSProperties}
      >
        <span>{row.label}</span>
        <small>
          {row.kind}
          {row.problemCount ? ` · ${row.problemCount}` : ""}
        </small>
      </button>
      {children.length > 0 ? (
        <ul>
          {children.map((child) => (
            <WorkbenchNodeRow key={child.id} context={context} row={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
