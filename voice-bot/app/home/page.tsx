import {
  ActionLink,
  AppShell,
  Icon,
  MiniNav,
  ScenarioLink,
} from "../components/flow-ui";

const quickScenarios = [
  { label: "School", icon: "school" },
  { label: "Meds", icon: "pharmacy" },
  { label: "Food", icon: "grocery" },
  { label: "Doctor", icon: "clinic" },
] as const;

export default function HomePage() {
  return (
    <AppShell
      title="Talkbridge"
      subtitle="Home screen"
      headerIcon="spark"
      backHref="/"
    >
      <section className="hero-card home-hero-card">
        <span className="hero-badge">Home</span>
        <div className="hero-ring">
          <Icon name="talk" className="hero-glyph" />
        </div>
        <div className="hero-copy">
          <h1>Choose what you need.</h1>
          <p>Start with a photo or open a saved scenario.</p>
        </div>
      </section>

      <section className="flow-action-grid">
        <ActionLink
          href="/photo"
          icon="photo"
          label="Take photo"
          detail="Use a real place to create a lesson."
        />
        <ActionLink
          href="/scenarios"
          icon="again"
          label="Open previous"
          detail="Return to a place you practiced before."
        />
      </section>

      <section className="scenario-card-grid">
        {quickScenarios.map((scenario) => (
          <ScenarioLink
            key={scenario.label}
            href="/scenarios"
            icon={scenario.icon}
            label={scenario.label}
          />
        ))}
      </section>

      <MiniNav active="home" />
    </AppShell>
  );
}
