import Link from "next/link";

/** Shown on the general (secondary) outbreak pages so readers know where the tracked investigation lives. */
export function SecondaryNote({ trackedName }: { trackedName: string | null }) {
  return (
    <p className="mb-2 rounded-md border border-line bg-panel px-3 py-2 text-xs text-ink-dim" data-testid="secondary-note">
      Global watch (secondary): all published outbreak records worldwide.{" "}
      {trackedName && <>The <Link href="/" className="text-accent">{trackedName}</Link> has its own dashboard, map and timeline. </>}
      <Link href="/global/map" className="text-accent">Map</Link> · <Link href="/outbreaks" className="text-accent">List</Link>
    </p>
  );
}
