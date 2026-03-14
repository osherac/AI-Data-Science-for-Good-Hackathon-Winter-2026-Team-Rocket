import Link from "next/link";
import { AppShell, Icon } from "./components/flow-ui";

export default function OpenAppPage() {
  return (
    <AppShell
      title="Talkbridge"
      subtitle="Open app"
      headerIcon="spark"
      label="Start"
    >
      <section className="hero-card splash-card">
        <span className="hero-badge">Welcome</span>
        <div className="hero-ring">
          <Icon name="mic" className="hero-glyph" />
        </div>
        <div className="hero-copy">
          <h1>Speak English where life happens.</h1>
          <p>Voice, photos, and simple practice for everyday places.</p>
        </div>
        <Link href="/home" className="primary-flow-button">
          Open app
        </Link>
      </section>
    </AppShell>
  );
}
