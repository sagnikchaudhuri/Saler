// Lightweight, dependency-free score-trend chart.
// Renders the visible overall score across seller turns as an SVG sparkline.
// Accessible: exposes role="img" with a descriptive label plus a
// visually-hidden data table so screen readers get the actual numbers.

export function ScoreTrend({ values }: { values: number[] }) {
  if (values.length === 0) {
    return (
      <div className="grid h-24 place-items-center rounded-lg border border-dashed border-line text-xs text-ink-muted">
        Your score trend appears after your first turn.
      </div>
    );
  }

  const width = 260;
  const height = 96;
  const pad = 8;
  const max = 100;
  const min = 0;
  const n = values.length;

  const x = (i: number) => (n === 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (n - 1));
  const y = (v: number) => pad + (1 - (v - min) / (max - min)) * (height - 2 * pad);

  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const areaPath =
    `M ${x(0)},${height - pad} ` +
    values.map((v, i) => `L ${x(i)},${y(v)}`).join(' ') +
    ` L ${x(n - 1)},${height - pad} Z`;

  const first = values[0];
  const last = values[values.length - 1];
  const dir = last > first ? 'up' : last < first ? 'down' : 'flat';
  const label = `Overall score trend across ${n} turn${n === 1 ? '' : 's'}: from ${first} to ${last} (${dir}).`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-24 w-full"
        role="img"
        aria-label={label}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="scoreArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f8cff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#4f8cff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#scoreArea)" />
        <polyline
          points={points}
          fill="none"
          stroke="#6ea0ff"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill="#eef2ff" />
        ))}
      </svg>
      {/* Screen-reader data table */}
      <table className="sr-only">
        <caption>Overall score by seller turn</caption>
        <thead>
          <tr>
            <th>Turn</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {values.map((v, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
