/** Shown while a page loads, so a click responds at once. */
export function PageSkeleton({ tiles = 3, rows = 5 }: { tiles?: number; rows?: number }) {
  return (
    <main className="wrap flex flex-col gap-6 py-7" aria-busy="true" aria-label="Loading">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {Array.from({ length: tiles }, (_, i) => (
          <div key={i} className="skel h-24" />
        ))}
      </div>
      <div className="box flex flex-col gap-3 p-5">
        <div className="skel h-6 w-64" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skel h-10" />
        ))}
      </div>
    </main>
  );
}
