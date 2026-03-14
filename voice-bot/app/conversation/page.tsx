import { generatedPhrases } from "../components/flow-data";
import {
  AppShell,
  HeroImageCard,
  Icon,
  MiniNav,
  PhraseAvatar,
} from "../components/flow-ui";

export default function ConversationPage() {
  return (
    <AppShell
      title="Conversation"
      subtitle="Generated phrases"
      headerIcon="talk"
      backHref="/home"
    >
      <HeroImageCard
        title="School office"
        subtitle="The chatbot generates phrases with an image to visualize the scene."
      />

      <div className="detail-stack">
        {generatedPhrases.map((group) => (
          <section key={group.title} className="phrase-card">
            <div className="phrase-card-header">
              <span className="section-chip">
                <Icon name="talk" className="section-chip-glyph" />
              </span>
              <div className="phrase-card-title">
                <h3>{group.title}</h3>
                <p>Tap one or more phrases to hear spoken English.</p>
              </div>
              <span className="tiny-status">{group.items.length}</span>
            </div>
            <div className="phrase-list">
              {group.items.map((item, index) => (
                <button
                  key={item}
                  type="button"
                  className={`phrase-button${index === 0 ? " selected" : ""}`}
                  aria-pressed={index === 0}
                >
                  <PhraseAvatar />
                  <p>{item}</p>
                  <span className="phrase-check">
                    <Icon name="check" className="phrase-check-glyph" />
                  </span>
                </button>
              ))}
            </div>
            <button type="button" className="mic-bar" aria-label="Play selected phrases">
              <span className="mic-bar-icon">
                <Icon name="mic" className="mic-bar-glyph" />
              </span>
              <span>Hear selected phrases</span>
            </button>
          </section>
        ))}
      </div>

      <MiniNav active="talk" />
    </AppShell>
  );
}
