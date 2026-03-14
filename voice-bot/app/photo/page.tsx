import Link from "next/link";
import { AppShell, Icon, MiniNav } from "../components/flow-ui";

export default function PhotoPage() {
  return (
    <AppShell
      title="Take photo"
      subtitle="Real place lesson"
      headerIcon="photo"
      backHref="/home"
    >
      <section className="hero-card detail-hero-card">
        <span className="hero-badge">Photo</span>
        <div className="camera-preview">
          <div className="camera-frame">
            <div className="camera-overlay">
              <span className="camera-chip">School office</span>
              <span className="camera-target" />
            </div>
          </div>
        </div>
        <div className="hero-copy detail-copy">
          <h1>Capture the place.</h1>
          <p>We will turn the photo into useful phrases and likely questions.</p>
        </div>
      </section>

      <section className="flow-info-card">
        <div className="flow-info-row">
          <span className="section-chip">
            <Icon name="photo" className="section-chip-glyph" />
          </span>
          <div>
            <strong>Use camera or upload</strong>
            <p>Choose a real classroom, pharmacy, or store.</p>
          </div>
        </div>
        <Link href="/conversation" className="primary-flow-button">
          Continue to conversation
        </Link>
      </section>

      <MiniNav active="photo" />
    </AppShell>
  );
}
