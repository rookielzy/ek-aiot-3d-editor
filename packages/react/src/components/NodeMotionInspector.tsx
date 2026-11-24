import { useId, useLayoutEffect, useState } from "react";
import {
  buildNodeMotionFields, DEFAULT_NODE_MOTION, updateNodeMotionField,
  type Editor, type EditorRuntime, type NodeMotion, type NodeMotionFieldId, type NodeMotionPreviewState
} from "@ek-aiot/3d-editor-core";
import { InspectorFieldControl } from "./InspectorFieldControl";
import { renderFieldLabel, type InspectorI18n } from "./inspector-i18n";

interface NodeMotionInspectorProps {
  editor: Editor;
  runtime: EditorRuntime | null;
  nodeId: string;
  motion?: NodeMotion;
  state: NodeMotionPreviewState;
  i18n: InspectorI18n;
}

export function NodeMotionInspector({ editor, runtime, nodeId, motion, state, i18n }: NodeMotionInspectorProps) {
  const problemId = useId();
  const [invalidField, setInvalidField] = useState<NodeMotionFieldId | null>(null);
  const [editFailed, setEditFailed] = useState(false);
  const playing = state === "playing";
  useLayoutEffect(() => () => runtime?.stopNodeMotionPreview?.(), [runtime]);

  function save(next: NodeMotion | null) {
    const result = editor.dispatch({ type: "set-node-motion", nodeId, motion: next });
    if (result.ok) setInvalidField(null);
    setEditFailed(!result.ok);
    return result.ok;
  }

  function commit(field: NodeMotionFieldId, input: string) {
    const current = editor.getSnapshot().nodes[nodeId];
    if (!current || !("motion" in current) || !current.motion) return false;
    const next = updateNodeMotionField(current.motion, field, input);
    setInvalidField(next ? null : field);
    return next !== null && save(next);
  }

  return (
    <section className="ek-inspector-section">
      {motion ? (
        <>
          <header className="ek-inspector-section__header"><h2>{i18n.t("inspector.motion.spin")}</h2></header>
          <div className="ek-inspector-grid ek-scene-fields">
            {buildNodeMotionFields(motion, state).map((field) => (
              <label key={field.id} className="ek-inspector-field">
                <span>{renderFieldLabel(i18n, field)}</span>
                <InspectorFieldControl field={field} i18n={i18n} invalid={invalidField === field.id}
                  descriptionId={invalidField === field.id ? problemId : undefined}
                  onCommit={(value) => commit(field.id, value)} onReset={() => setInvalidField(null)} />
                {invalidField === field.id ? <small className="ek-inspector-field-problem" id={problemId} role="alert">{i18n.t("inspector.motion.invalidSpeed")}</small> : null}
              </label>
            ))}
          </div>
          <div className="ek-inspector-button-row">
            <button type="button" data-ek-discard-draft disabled={!playing && state !== "ready"}
              onClick={() => playing ? runtime?.stopNodeMotionPreview?.() : runtime?.startNodeMotionPreview?.(nodeId)}>
              {i18n.t(playing ? "inspector.motion.stop" : "inspector.motion.preview")}
            </button>
            <button type="button" data-ek-discard-draft disabled={playing} onClick={() => save(null)}>{i18n.t("inspector.motion.remove")}</button>
          </div>
          {state !== "ready" ? <p className="ek-inspector-warning" role="status">{i18n.t(`inspector.motion.${state}`)}</p> : null}
        </>
      ) : (
        <div className="ek-inspector-button-row">
          <button type="button" onClick={() => save(DEFAULT_NODE_MOTION)}>{i18n.t("inspector.motion.add")}</button>
        </div>
      )}
      {editFailed ? <p className="ek-inspector-field-problem" role="alert">{i18n.t("inspector.motion.editFailed")}</p> : null}
    </section>
  );
}
