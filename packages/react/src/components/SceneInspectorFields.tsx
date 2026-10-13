import { useId, type ReactNode } from "react";
import type { InspectorCommandProblem, InspectorFieldDescriptor } from "@ek-aiot/3d-editor-core";
import { InspectorFieldControl } from "./InspectorFieldControl";
import { renderFieldLabel, renderProblemMessage, type InspectorI18n } from "./inspector-i18n";

interface SceneInspectorFieldsProps {
  fields: InspectorFieldDescriptor[];
  targetKey?: string;
  problem?: InspectorCommandProblem | null;
  i18n: InspectorI18n;
  onCommit(fieldId: string, value: string): boolean;
  onReset?(fieldId: string): void;
}

// Render Core field descriptors without maintaining a second copy of scene values.
export function SceneInspectorFields({ fields, targetKey = "environment", problem, i18n, onCommit, onReset }: SceneInspectorFieldsProps) {
  const id = useId();
  function renderField(field: InspectorFieldDescriptor, axis?: string) {
    const activeProblem = problem?.fieldId === field.id ? problem : field.problem;
    const descriptionId = activeProblem ? `${id}-${field.id}` : undefined;
    const label = renderFieldLabel(i18n, field);
    return (
      <label key={field.id} className={axis ? "ek-inspector-axis" : `ek-inspector-field${field.kind === "checkbox" ? " ek-inspector-field--checkbox" : ""}`} data-axis={axis}>
        <span aria-hidden={axis ? true : undefined}>{axis ? axis.toUpperCase() : label}</span>
        <InspectorFieldControl key={`${targetKey}:${field.id}`} field={field} invalid={!!activeProblem} descriptionId={descriptionId} i18n={i18n}
          onCommit={(value) => onCommit(field.id, value)} onReset={() => onReset?.(field.id)} />
        {activeProblem ? <small id={descriptionId} className="ek-inspector-field-problem" role={problem?.fieldId === field.id ? "alert" : undefined}>{renderProblemMessage(i18n, activeProblem)}</small> : null}
      </label>
    );
  }

  const content: ReactNode[] = [];
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index]!;
    if (field.id.endsWith(".x") && fields[index + 1]?.id === field.id.replace(/x$/, "y") && fields[index + 2]?.id === field.id.replace(/x$/, "z")) {
      const prefix = field.id.slice(0, -2);
      const title = prefix === "position" ? i18n.t("reactWorkbench.inspector.transform.position")
        : prefix === "target" ? i18n.t("reactWorkbench.inspector.sceneFields.target")
        : prefix === "environment.rotation" ? i18n.t("reactWorkbench.inspector.sceneFields.lightingRotation")
        : i18n.t("reactWorkbench.inspector.sceneFields.backgroundRotation");
      content.push(<fieldset key={prefix} className="ek-inspector-vector"><legend>{title}</legend><div className="ek-inspector-grid ek-inspector-grid--vectors">
        {fields.slice(index, index + 3).map((item) => renderField(item, item.id.slice(-1)))}
      </div></fieldset>);
      index += 2;
    } else {
      content.push(renderField(field));
    }
  }
  return <div className="ek-inspector-grid ek-scene-fields">{content}</div>;
}
