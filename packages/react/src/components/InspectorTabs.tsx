import { useId, useState, type ReactNode } from "react";

interface InspectorTabsProps {
  label: string;
  tabs: readonly { id: string; label: string; content: ReactNode }[];
  secondary?: boolean;
  value?: string;
  onChange?(id: string): void;
}

export function InspectorTabs({ label, tabs, secondary, value, onChange }: InspectorTabsProps) {
  const id = useId();
  const [preferredTab, setPreferredTab] = useState<string>();
  const activeTab = tabs.find((tab) => tab.id === (value ?? preferredTab)) ?? tabs[0];
  const select = onChange ?? setPreferredTab;
  if (!tabs.length) return null;

  return (
    <>
      <div className={secondary ? "ek-inspector-tabs ek-inspector-tabs--secondary" : "ek-inspector-tabs"} role="tablist" aria-label={label}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`${id}-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`${id}-panel-${tab.id}`}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => select(tab.id)}
            onKeyDown={(event) => {
              const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
                : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
                : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
              if (next === null) return;
              event.preventDefault();
              select(tabs[next]!.id);
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} role="tabpanel" id={`${id}-panel-${tab.id}`} aria-labelledby={`${id}-tab-${tab.id}`} hidden={activeTab !== tab}>
          {tab.content}
        </div>
      ))}
    </>
  );
}
