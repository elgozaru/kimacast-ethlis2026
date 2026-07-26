/// Nav destinations shown in the mockups (My agents, Sales, Campaigns,
/// Settings) that aren't part of this iteration's functional scope -
/// Overview, onboarding, and Content (suggestions/approve) are. Kept as
/// simple placeholders rather than left unlinked, so the sidebar matches
/// the mockups' full nav without pretending these are built.
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p style={{ color: "var(--text-muted)" }}>Not part of this iteration yet.</p>
    </div>
  );
}
