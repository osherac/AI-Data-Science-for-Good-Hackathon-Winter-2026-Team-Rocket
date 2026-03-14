import Link from "next/link";
import { savedScenarios } from "../components/flow-data";
import { AppShell, Icon, MiniNav } from "../components/flow-ui";

export default function ScenariosPage() {
  return (
    <AppShell
      title="Previous scenarios"
      subtitle="Saved lessons"
      headerIcon="again"
      backHref="/home"
    >
      <section className="flow-list-card">
        <div className="phrase-card-header">
          <div className="phrase-card-title">
            <h3>Choose a saved place</h3>
            <p>Open a scenario you practiced before.</p>
          </div>
          <span className="tiny-status">{savedScenarios.length}</span>
        </div>

        <div className="saved-list">
          {savedScenarios.map((scenario) => (
            <Link
              key={scenario.label}
              href="/conversation"
              className="saved-scenario-row"
            >
              <span className="scenario-icon large">
                <Icon name={scenario.icon} className="scenario-glyph" />
              </span>
              <div>
                <strong>{scenario.label}</strong>
                <p>{scenario.detail}</p>
              </div>
              <span className="saved-arrow">
                <Icon name="back" className="saved-arrow-glyph" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <MiniNav active="me" />
    </AppShell>
  );
}
