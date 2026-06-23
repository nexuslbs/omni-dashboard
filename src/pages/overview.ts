import {
  apiGet,
  type DashboardData,
  type DashboardKpis,
  type HourlyBucket,
  type StatusCount,
  type DailyTokens,
  type ChannelHealthRow,
  type ToolUsage,
  type KanbanBoardResponse,
} from "../lib/api";
import { escapeHtml } from "../lib/helpers";

export function renderOverview(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Overview Dashboard</h1>
      <p class="page-subtitle">System health, activity, and performance at a glance</p>
    </div>
    <div id="dashboard-content"><div class="loading" style="padding:3rem;text-align:center;">Loading dashboard...</div></div>
  `;
  void loadDashboard();
}

// ── Color palette for charts ──

const COLORS = {
  purple: "#8b5cf6",
  cyan: "#06b6d4",
  amber: "#f59e0b",
  rose: "#f43f5e",
  emerald: "#10b981",
  blue: "#3b82f6",
  muted: "#64748b",
  textSecondary: "#94a3b8",
  border: "rgba(255,255,255,0.06)",
  cardBg: "rgba(255,255,255,0.03)",
};

const STATUS_COLORS: Record<string, string> = {
  completed: COLORS.emerald,
  failed: COLORS.rose,
  skipped: COLORS.muted,
  interrupted: COLORS.amber,
  pending: COLORS.blue,
  processing: COLORS.cyan,
};

// ── Main Loader ──

async function loadDashboard(): Promise<void> {
  const content = document.getElementById("dashboard-content")!;
  try {
    const data = await apiGet<DashboardData>("/overview/dashboard");

    // Fetch kanban snapshot separately — direct from /api/kanban/board
    let kanbanSnapshot: { id: string; status: string; count: number }[] = [];
    try {
      const kanbanData = await apiGet<KanbanBoardResponse>("/kanban/board");
      kanbanSnapshot = (kanbanData.columns || []).map((col) => ({
        id: col.id,
        status: col.title,
        count: col.tasks?.length || 0,
      }));
    } catch {
      /* kanban may not be available */
    }

    content.innerHTML = renderDashboard(data, kanbanSnapshot);
    wireDashboard(data, kanbanSnapshot);
  } catch (e) {
    content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;">Failed to load: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

// ── Dashboard HTML ──

function renderDashboard(
  data: DashboardData,
  kanbanSnapshot: { id: string; status: string; count: number }[],
): string {
  return `
    ${renderKpiRow(data.kpis)}
    ${renderChartRow(data.threads_over_time, data.status_distribution, data.token_trend)}
    ${renderTableRow(data.recent_activity, data.channel_health)}
    ${renderBottomBar(data.top_tools, kanbanSnapshot)}
  `;
}

function wireDashboard(
  data: DashboardData,
  _kanbanSnapshot: { id: string; status: string; count: number }[],
): void {
  // Wire bar chart
  const barChartEl = document.getElementById("chart-bar");
  if (barChartEl) barChartEl.innerHTML = renderBarChart(data.threads_over_time);

  // Wire donut chart
  const donutChartEl = document.getElementById("chart-donut");
  if (donutChartEl) donutChartEl.innerHTML = renderDonutChart(data.status_distribution);

  // Wire line chart
  const lineChartEl = document.getElementById("chart-line");
  if (lineChartEl) lineChartEl.innerHTML = renderLineChart(data.token_trend);
}
// ── Row 1: KPI Cards ──

function renderKpiRow(kpis: DashboardKpis): string {
  const pctThreads =
    kpis.threads_yesterday > 0
      ? (((kpis.threads_today - kpis.threads_yesterday) / kpis.threads_yesterday) * 100).toFixed(1)
      : "—";
  const pctTime =
    kpis.avg_response_yesterday > 0
      ? (
          ((kpis.avg_response_time - kpis.avg_response_yesterday) / kpis.avg_response_yesterday) *
          100
        ).toFixed(1)
      : "—";
  const pctTokens =
    kpis.tokens_yesterday > 0
      ? (((kpis.tokens_today - kpis.tokens_yesterday) / kpis.tokens_yesterday) * 100).toFixed(1)
      : "—";
  const threadsTrend =
    pctThreads !== "—" ? (Number(pctThreads) >= 0 ? "+" : "") + pctThreads + "% vs yesterday" : "—";
  const timeTrend = pctTime !== "—" ? (Number(pctTime) >= 0 ? "+" : "") + pctTime + "% vs yesterday" : "—";
  const tokensTrend =
    pctTokens !== "—" ? (Number(pctTokens) >= 0 ? "+" : "") + pctTokens + "% vs yesterday" : "—";

  return `
    <div class="dashboard-kpi-row">
      <div class="stat-card purple">
        <div class="stat-card-label">Threads Today</div>
        <div class="stat-card-value">${kpis.threads_today.toLocaleString()}</div>
        <div class="stat-card-sub">${threadsTrend}</div>
        <svg class="stat-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </div>
      <div class="stat-card cyan">
        <div class="stat-card-label">Avg Response Time</div>
        <div class="stat-card-value">${formatDuration(kpis.avg_response_time)}</div>
        <div class="stat-card-sub">${timeTrend}</div>
        <svg class="stat-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
      </div>
      <div class="stat-card amber">
        <div class="stat-card-label">Token Consumption</div>
        <div class="stat-card-value">${formatTokens(kpis.tokens_today)}</div>
        <div class="stat-card-sub">${tokensTrend}</div>
        <svg class="stat-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      </div>
      <div class="stat-card emerald">
        <div class="stat-card-label">Active Channels</div>
        <div class="stat-card-value">${kpis.active_channels}</div>
        <div class="stat-card-sub">Channels with activity in 24h</div>
        <svg class="stat-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>
      </div>
    </div>
  `;
}

// ── Row 2: Charts ──

function renderChartRow(
  _hourly: HourlyBucket[],
  _statusDist: StatusCount[],
  _tokenTrend: DailyTokens[],
): string {
  return `
    <div class="dashboard-chart-row">
      <div class="card dashboard-chart-card">
        <div class="card-header"><span class="card-title">Threads Over Time (7 days, hourly)</span></div>
        <div class="card-body"><div id="chart-bar" class="chart-container"><div class="loading">Loading...</div></div></div>
      </div>
      <div class="card dashboard-chart-card">
        <div class="card-header"><span class="card-title">Status Distribution</span></div>
        <div class="card-body"><div id="chart-donut" class="chart-container chart-donut-container"><div class="loading">Loading...</div></div></div>
      </div>
      <div class="card dashboard-chart-card">
        <div class="card-header"><span class="card-title">Token Trend (14 days)</span></div>
        <div class="card-body"><div id="chart-line" class="chart-container"><div class="loading">Loading...</div></div></div>
      </div>
    </div>
  `;
}

// ── SVG Bar Chart ──

function renderBarChart(hourly: HourlyBucket[]): string {
  if (!hourly || hourly.length === 0) return '<div class="empty-state">No data</div>';

  const width = 600;
  const height = 180;
  const padding = { top: 10, right: 10, bottom: 24, left: 10 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Aggregate to daily for compactness (7 days)
  const daily: { label: string; count: number }[] = [];
  const dayMap = new Map<string, number>();
  for (const h of hourly) {
    // bucket may be Date object (pg rowMode:array) or ISO string (JSON aggregate); normalize to ISO string
    const bucketStr =
      typeof h.bucket === "object" && (h.bucket as any) instanceof Date
        ? (h.bucket as Date).toISOString()
        : String(h.bucket);
    const day = bucketStr.slice(0, 10);
    dayMap.set(day, (dayMap.get(day) || 0) + h.count);
  }
  for (const [day, count] of dayMap) {
    const shortDay = new Date(day + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short" });
    daily.push({ label: shortDay, count });
  }

  const maxVal = Math.max(...daily.map((d) => d.count), 1);
  const barWidth = Math.min(36, (chartW / daily.length) * 0.6);
  const gap = (chartW - barWidth * daily.length) / (daily.length + 1);

  const bars = daily
    .map((d, i) => {
      const x = padding.left + gap + i * (barWidth + gap);
      const barH = (d.count / maxVal) * chartH;
      const y = padding.top + chartH - barH;
      return `<rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(barH, 1)}" fill="${COLORS.purple}" opacity="0.85" rx="2">
      <title>${d.label}: ${d.count}</title>
    </rect>`;
    })
    .join("");

  const labels = daily
    .map((d, i) => {
      const x = padding.left + gap + i * (barWidth + gap) + barWidth / 2;
      return `<text x="${x}" y="${height - 6}" text-anchor="middle" fill="${COLORS.textSecondary}" font-size="9">${d.label}</text>`;
    })
    .join("");

  return `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
    <rect x="0" y="0" width="${width}" height="${height}" fill="none"/>
    ${bars}
    ${labels}
  </svg>`;
}

// ── SVG Donut Chart ──

function renderDonutChart(statusDist: StatusCount[]): string {
  if (!statusDist || statusDist.length === 0) return '<div class="empty-state">No data</div>';

  const total = statusDist.reduce((s, d) => s + d.count, 0);
  if (total === 0) return '<div class="empty-state">No threads yet</div>';

  const cx = 90;
  const cy = 90;
  const r = 72;
  const strokeW = 22;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const slices = statusDist.map((d) => {
    const pct = d.count / total;
    const length = pct * circumference;
    const slice = { ...d, pct, offset, length };
    offset += length;
    return slice;
  });

  const arcs = slices
    .map((s) => {
      const color = STATUS_COLORS[s.status] || COLORS.muted;
      const dashArray = `${s.length} ${circumference - s.length}`;
      const dashOffset = -s.offset;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${strokeW}"
      stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}"
      transform="rotate(-90 ${cx} ${cy})" opacity="0.9">
      <title>${s.status}: ${s.count} (${(s.pct * 100).toFixed(1)}%)</title>
    </circle>`;
    })
    .join("");

  // Legend
  const legend = slices
    .map((s) => {
      const color = STATUS_COLORS[s.status] || COLORS.muted;
      return `<div class="donut-legend-item">
      <span class="donut-legend-dot" style="background:${color}"></span>
      <span class="donut-legend-label">${s.status}</span>
      <span class="donut-legend-count">${s.count}</span>
    </div>`;
    })
    .join("");

  return `<div class="donut-wrapper">
    <svg width="180" height="180" viewBox="0 0 180 180">
      <rect x="0" y="0" width="180" height="180" fill="none"/>
      ${arcs}
      <text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="${COLORS.textSecondary}" font-size="11">Total</text>
      <text x="${cx}" y="${cy + 12}" text-anchor="middle" fill="white" font-size="18" font-weight="700">${total}</text>
    </svg>
    <div class="donut-legend">${legend}</div>
  </div>`;
}

// ── SVG Line Chart ──

function renderLineChart(tokenTrend: DailyTokens[]): string {
  if (!tokenTrend || tokenTrend.length === 0) return '<div class="empty-state">No data</div>';

  const width = 600;
  const height = 180;
  const padding = { top: 10, right: 10, bottom: 24, left: 44 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const values = tokenTrend.map((d) => d.tokens);
  const maxVal = Math.max(...values, 1);

  // Y-axis ticks
  const yTicks = 4;
  const yStep = maxVal / yTicks;
  const yGrid = Array.from({ length: yTicks + 1 }, (_, i) => {
    const val = Math.round(i * yStep);
    const y = padding.top + chartH - (val / maxVal) * chartH;
    return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="${COLORS.border}" stroke-width="1"/>
      <text x="${padding.left - 6}" y="${y + 4}" text-anchor="end" fill="${COLORS.textSecondary}" font-size="9">${formatTokens(val)}</text>`;
  }).join("");

  // Points and polyline
  if (tokenTrend.length === 1) {
    // Single point — just show a dot
    const x = padding.left + chartW / 2;
    const y = padding.top + chartH / 2;
    const val = values[0];
    return `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width="${width}" height="${height}" fill="none"/>
      ${yGrid}
      <circle cx="${x}" cy="${y}" r="4" fill="${COLORS.cyan}" opacity="0.9"/>
      <text x="${x}" y="${height - 6}" text-anchor="middle" fill="${COLORS.textSecondary}" font-size="9">${formatDate(tokenTrend[0].day)}</text>
      <text x="${x}" y="${y - 10}" text-anchor="middle" fill="${COLORS.cyan}" font-size="10">${formatTokens(val)}</text>
    </svg>`;
  }

  const stepX = chartW / (tokenTrend.length - 1);
  const points = tokenTrend.map((d, i) => {
    const x = padding.left + i * stepX;
    const y = padding.top + chartH - (d.tokens / maxVal) * chartH;
    return { x, y, label: formatDate(d.day), val: d.tokens };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
  const dots = points
    .map((p, i) => {
      // Show dots only every ~3 points or last
      if (i % 3 !== 0 && i !== points.length - 1) return "";
      return `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${COLORS.cyan}" opacity="0.9">
      <title>${p.label}: ${formatTokens(p.val)}</title>
    </circle>`;
    })
    .join("");

  // Labels every ~3 days
  const labels = points
    .map((p, i) => {
      if (i % 3 !== 0 && i !== points.length - 1) return "";
      return `<text x="${p.x}" y="${height - 6}" text-anchor="middle" fill="${COLORS.textSecondary}" font-size="9">${formatDate(p.label)}</text>`;
    })
    .join(" ");

  // Area fill
  const areaPoints = `${points[0].x},${padding.top + chartH} ${polyline} ${points[points.length - 1].x},${padding.top + chartH}`;

  return `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
    <rect x="0" y="0" width="${width}" height="${height}" fill="none"/>
    ${yGrid}
    <polygon points="${areaPoints}" fill="url(#lineGrad)" opacity="0.15"/>
    <polyline points="${polyline}" fill="none" stroke="${COLORS.cyan}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    ${labels}
    <defs>
      <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${COLORS.cyan}" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="${COLORS.cyan}" stop-opacity="0"/>
      </linearGradient>
    </defs>
  </svg>`;
}

// ── Row 3: Tables ──

function renderTableRow(recent: DashboardData["recent_activity"], channelHealth: ChannelHealthRow[]): string {
  const recentHtml =
    recent.length === 0
      ? '<div class="empty-state">No recent activity</div>'
      : `<div class="table-scroll"><div class="data-table" role="table"><div role="rowgroup"><div class="thread-header" role="row">
          <div role="columnheader">Status</div><div role="columnheader">Channel</div><div role="columnheader" class="col-preview">Preview</div><div role="columnheader" style="text-align:right">Time</div><div role="columnheader" style="text-align:right">Tokens</div><div role="columnheader">When</div>
        </div></div><div role="rowgroup">${recent.map((r) => renderRecentRow(r)).join("")}</div></div></div>`;

  const healthHtml =
    channelHealth.length === 0
      ? '<div class="empty-state">No channel data</div>'
      : `<div class="table-scroll"><table class="data-table">
        <thead><tr>
          <th>Channel</th><th>Today</th><th>Avg Duration</th><th>Success Rate</th><th>Last Activity</th>
        </tr></thead>
        <tbody>${channelHealth.map((ch) => renderHealthRow(ch)).join("")}</tbody>
      </table></div>`;

  return `
    <div class="dashboard-table-row">
      <div class="card dashboard-table-card">
        <div class="card-header"><span class="card-title">Recent Activity</span><span class="card-badge">Last 10 threads</span></div>
        <div class="card-body card-body-nopad">${recentHtml}</div>
      </div>
      <div class="card dashboard-table-card">
        <div class="card-header"><span class="card-title">Channel Health</span></div>
        <div class="card-body card-body-nopad">${healthHtml}</div>
      </div>
    </div>
  `;
}

function renderRecentRow(r: DashboardData["recent_activity"][0]): string {
  const preview = r.content_preview
    ? escapeHtml(r.content_preview.slice(0, 80)) + (r.content_preview.length > 80 ? "\u2026" : "")
    : "<em>Empty</em>";
  const ts = formatTimeAgo(r.created_at);
  const tokens = r.completion_tokens || 0;
  const url = `/messages?thread_id=${escapeHtml(r.thread_id || "")}`;
  return `<a href="${url}" class="dashboard-overview-row" role="row">
    <div role="cell"><span class="badge status-badge-${r.status ? r.status.toLowerCase() : "unknown"}">${escapeHtml(r.status || "unknown")}</span></div>
    <div role="cell"><span class="badge badge-neutral">${escapeHtml(r.channel_name || "\u2014")}</span></div>
    <div role="cell" class="cell-preview">${preview}</div>
    <div role="cell" class="cell-num">${r.processing_time_ms !== null ? r.processing_time_ms.toFixed(0) + "ms" : "\u2014"}</div>
    <div role="cell" class="cell-num">${tokens > 0 ? tokens.toLocaleString() : "\u2014"}</div>
    <div role="cell" class="cell-timestamp">${ts}</div>
  </a>`;
}

function renderHealthRow(ch: ChannelHealthRow): string {
  const lastActive = ch.last_activity ? formatTimeAgo(ch.last_activity) : "\u2014";
  const successPct = (ch.success_rate * 100).toFixed(0);
  return `<tr>
    <td><span class="badge badge-neutral">${escapeHtml(ch.name)}</span></td>
    <td class="cell-num">${ch.threads_today}</td>
    <td class="cell-num">${formatDuration(ch.avg_duration)}</td>
    <td class="cell-num"><span class="badge ${ch.success_rate >= 0.8 ? "status-badge-completed" : ch.success_rate >= 0.5 ? "status-badge-interrupted" : "status-badge-failed"}">${successPct}%</span></td>
    <td class="cell-timestamp">${lastActive}</td>
  </tr>`;
}

// ── Row 4: Bottom Bar ──

function renderBottomBar(
  tools: ToolUsage[],
  kanban: { id: string; status: string; count: number }[],
): string {
  const toolsHtml =
    tools.length === 0
      ? '<div class="empty-state">No tools used in 7 days</div>'
      : `<div class="table-scroll"><table class="data-table">
        <thead><tr><th>Tool</th><th class="cell-num">Calls (7d)</th></tr></thead>
        <tbody>${tools.map((t) => `<tr><td><span class="badge badge-neutral">${escapeHtml(t.tool)}</span></td><td class="cell-num">${t.count}</td></tr>`).join("")}</tbody>
      </table></div>`;

  const kanbanHtml =
    kanban.length === 0
      ? '<div class="empty-state">No kanban data</div>'
      : `<div class="table-scroll"><table class="data-table">
        <thead><tr><th>Status</th><th class="cell-num">Count</th></tr></thead>
        <tbody>${kanban.map((k) => `<tr><td><span class="badge ${kanbanBadgeClass(k.id)}">${escapeHtml(k.status)}</span></td><td class="cell-num">${k.count}</td></tr>`).join("")}</tbody>
      </table></div>`;

  return `
    <div class="dashboard-bottom-row">
      <div class="card dashboard-bottom-card">
        <div class="card-header"><span class="card-title">Top Tools Used</span></div>
        <div class="card-body card-body-nopad">${toolsHtml}</div>
      </div>
      <div class="card dashboard-bottom-card">
        <div class="card-header"><span class="card-title">Kanban Snapshot</span></div>
        <div class="card-body card-body-nopad">${kanbanHtml}</div>
      </div>
    </div>
  `;
}

// ── Helpers ──

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
}

function formatTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return (n / 1000).toFixed(1) + "K";
  return (n / 1_000_000).toFixed(1) + "M";
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00Z" : ""));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTimeAgo(dateStr: string): string {
  const d = new Date(
    dateStr.endsWith("Z") || dateStr.includes("+") || dateStr.includes("T") ? dateStr : dateStr + "Z",
  );
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function kanbanBadgeClass(statusId: string): string {
  switch (statusId) {
    case "backlog":
      return "badge-neutral";
    case "todo":
      return "badge-purple";
    case "ready":
      return "badge-warning";
    case "running":
      return "badge-cyan";
    case "review":
      return "badge-blue";
    case "done":
      return "badge-success";
    case "blocked":
      return "badge-error";
    default:
      return "badge-neutral";
  }
}
