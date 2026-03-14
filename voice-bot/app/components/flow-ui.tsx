import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

type IconName =
  | "talk"
  | "photo"
  | "again"
  | "school"
  | "pharmacy"
  | "grocery"
  | "clinic"
  | "home"
  | "person"
  | "mic"
  | "spark"
  | "back"
  | "check";

export function Icon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  const shared = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
    className,
    "aria-hidden": true,
  };

  switch (name) {
    case "talk":
      return (
        <svg {...shared}>
          <path d="M5 7.5a4.5 4.5 0 0 1 4.5-4.5h5A4.5 4.5 0 0 1 19 7.5v3A4.5 4.5 0 0 1 14.5 15H11l-4 3v-3.2A4.48 4.48 0 0 1 5 10.5z" />
          <path d="M9 8h6" />
          <path d="M9 11h4" />
        </svg>
      );
    case "photo":
      return (
        <svg {...shared}>
          <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
          <path d="M8.5 5 10 3.5h4L15.5 5" />
          <circle cx="12" cy="12" r="3.2" />
        </svg>
      );
    case "again":
      return (
        <svg {...shared}>
          <path d="M7 8H4V5" />
          <path d="M4.6 8A8 8 0 0 1 18 6" />
          <path d="M17 16h3v3" />
          <path d="M19.4 16A8 8 0 0 1 6 18" />
        </svg>
      );
    case "school":
      return (
        <svg {...shared}>
          <path d="m3 10 9-6 9 6" />
          <path d="M5 10v9h14v-9" />
          <path d="M10 19v-5h4v5" />
        </svg>
      );
    case "pharmacy":
      return (
        <svg {...shared}>
          <path d="M12 4v16" />
          <path d="M4 12h16" />
          <rect x="5" y="5" width="14" height="14" rx="3" />
        </svg>
      );
    case "grocery":
      return (
        <svg {...shared}>
          <path d="M6 7h13l-1.3 6.2a2 2 0 0 1-2 1.6H9.4a2 2 0 0 1-2-1.5L5 4H3" />
          <circle cx="10" cy="18.5" r="1.2" />
          <circle cx="16" cy="18.5" r="1.2" />
        </svg>
      );
    case "clinic":
      return (
        <svg {...shared}>
          <path d="M12 20s-6.5-3.8-6.5-9.2A3.8 3.8 0 0 1 9.3 7a4 4 0 0 1 2.7 1.2A4 4 0 0 1 14.7 7a3.8 3.8 0 0 1 3.8 3.8C18.5 16.2 12 20 12 20Z" />
          <path d="M12 9.5v4.8" />
          <path d="M9.6 11.9h4.8" />
        </svg>
      );
    case "home":
      return (
        <svg {...shared}>
          <path d="m4 11 8-6 8 6" />
          <path d="M6 10.8V19h12v-8.2" />
        </svg>
      );
    case "person":
      return (
        <svg {...shared}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
        </svg>
      );
    case "mic":
      return (
        <svg {...shared}>
          <rect x="9" y="4" width="6" height="10" rx="3" />
          <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0" />
          <path d="M12 17v3" />
          <path d="M9 20h6" />
        </svg>
      );
    case "spark":
      return (
        <svg {...shared}>
          <path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4Z" />
        </svg>
      );
    case "back":
      return (
        <svg {...shared}>
          <path d="m15 18-6-6 6-6" />
        </svg>
      );
    case "check":
      return (
        <svg {...shared}>
          <path d="m5 12 4.2 4.2L19 6.5" />
        </svg>
      );
    default:
      return null;
  }
}

export function AppShell({
  children,
  title,
  subtitle,
  headerIcon,
  backHref,
  label,
}: {
  children: ReactNode;
  title: string;
  subtitle: string;
  headerIcon: IconName;
  backHref?: string;
  label?: string;
}) {
  return (
    <main className="flow-stage">
      <section className="flow-phone">
        <header className="app-header">
          <div className="brand-block">
            <span className="brand-mark">
              <Icon name={headerIcon} className="brand-glyph" />
            </span>
            <div>
              <p>{title}</p>
              <span>{subtitle}</span>
            </div>
          </div>
          {backHref ? (
            <Link href={backHref} className="header-chip" aria-label="Go back">
              <Icon name="back" className="header-glyph" />
            </Link>
          ) : (
            <span className="header-pill">{label ?? "Flow"}</span>
          )}
        </header>
        {children}
      </section>
    </main>
  );
}

export function HeroImageCard({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <section className="hero-card detail-hero-card">
      <span className="hero-badge">Scenario</span>
      <div className="detail-image">
        <Image
          src="/classroom-scene.svg"
          alt="Classroom practice scene"
          fill
          priority
          sizes="(max-width: 900px) 80vw, 22rem"
        />
      </div>
      <div className="hero-copy detail-copy">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </section>
  );
}

export function PhraseAvatar() {
  return (
    <span className="phrase-avatar" aria-hidden="true">
      <span className="phrase-head" />
      <span className="phrase-body" />
    </span>
  );
}

export function MiniNav({
  active,
}: {
  active: "home" | "talk" | "photo" | "me";
}) {
  const items = [
    { id: "home", label: "Home", icon: "home" as const, href: "/home" },
    { id: "talk", label: "Talk", icon: "talk" as const, href: "/conversation" },
    { id: "photo", label: "Photo", icon: "photo" as const, href: "/photo" },
    { id: "me", label: "Me", icon: "person" as const, href: "/scenarios" },
  ];

  return (
    <nav className="mini-nav" aria-label="Primary">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={`mini-nav-item${active === item.id ? " active" : ""}`}
          aria-current={active === item.id ? "page" : undefined}
        >
          <Icon name={item.icon} className="mini-nav-glyph" />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function ActionLink({
  href,
  icon,
  label,
  detail,
}: {
  href: string;
  icon: IconName;
  label: string;
  detail: string;
}) {
  return (
    <Link href={href} className="flow-action-card">
      <span className="flow-action-icon">
        <Icon name={icon} className="tile-glyph" />
      </span>
      <div>
        <strong>{label}</strong>
        <p>{detail}</p>
      </div>
    </Link>
  );
}

export function ScenarioLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: IconName;
  label: string;
}) {
  return (
    <Link href={href} className="scenario-pill">
      <span className="scenario-icon">
        <Icon name={icon} className="scenario-glyph" />
      </span>
      <span>{label}</span>
    </Link>
  );
}
