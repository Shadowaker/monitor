/**
 * Statistics dashboard — configura qui gli endpoint API quando sono pronti.
 *
 * Ogni fetcher deve restituire una Promise che risolve con i dati attesi
 * (vedi commenti sui tipi sotto). In assenza di URL, vengono usati dati demo.
 */
const StatisticsConfig = {
    /** @type {Record<string, string>} mappa chiave → URL assoluto o relativo */
    endpoints: {
        // kpi: "/api/statistics/kpi",
        // usageTrend: "/api/statistics/usage-trend",
        // clusterDistribution: "/api/statistics/clusters",
    },

    /** Header opzionali per le richieste (token, ecc.) */
    fetchOptions: {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
    },
};

/** @typedef {{ label: string, value: string|number, delta?: string, deltaPositive?: boolean, variant?: string }} KpiItem */
/** @typedef {{ labels: string[], values: number[] }} ChartSeries */
let charts = { grouped: null, origin: null, age: null, gender: null, grade: null, exam: null };

function $(id) {
    return document.getElementById(id);
}

async function fetchJson(url) {
    const res = await fetch(url, StatisticsConfig.fetchOptions);
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
    return res.json();
}

async function fetchOrDemo(key, demoFn) {
    const url = StatisticsConfig.endpoints[key];
    if (!url) return demoFn();
    return fetchJson(url);
}

function getBootstrap() {
    return window.StatisticsBootstrap || null;
}

function kpisFromLocationStats(stats) {
    if (!stats) return null;
    return /** @type {KpiItem[]} */ ([
        { label: "Postazioni utilizzate", value: stats.occupied ?? 0, variant: "success" },
        { label: "Postazioni offline", value: stats.offline ?? 0, variant: "danger" },
        { label: "In manutenzione", value: stats.maintenance ?? 0, variant: "warning" },
        { label: "Disponibili", value: stats.available ?? 0 },
    ]);
}

function resolveKpis(boot) {
    if (boot?.kpiItems?.length) return boot.kpiItems;
    const fromStats = kpisFromLocationStats(boot?.locationStats);
    if (fromStats) return fromStats;
    return null;
}

function demoKpis() {
    return /** @type {KpiItem[]} */ ([
        { label: "Postazioni utilizzate", value: "—", delta: "In attesa API", variant: "success" },
        { label: "Postazioni offline", value: "—", delta: "In attesa API", variant: "danger" },
        { label: "In manutenzione", value: "—", delta: "In attesa API", variant: "warning" },
        { label: "Disponibili", value: "—", delta: "In attesa API" },
    ]);
}

function renderKpis(items) {
    const order = ["online", "maintenance", "offline", "available"];
    const bySlot = Object.fromEntries(
        items.map((item) => [item.slot || item.label.toLowerCase(), item])
    );
    order.forEach((slot) => {
        const item = bySlot[slot];
        if (!item) return;
        const card = document.querySelector(`.kpi-card[data-slot="${slot}"]`);
        if (!card) return;
        const valueEl = card.querySelector(".kpi-card__value");
        if (valueEl) valueEl.textContent = String(item.value);
    });
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function chartColors() {
    return {
        accent: "#00babc",
        accentDim: "rgba(0, 186, 188, 0.25)",
        palette: ["#00babc", "#04809f", "#4caf82", "#e6a23c", "#7b68ee", "#e85d5d"],
        grid: "rgba(255,255,255,0.06)",
        text: "#aaa",
    };
}

/** Etichette esterne con linea (stile Excel) per torta / doughnut. */
const externalLabelLinesPlugin = {
    id: "externalLabelLines",
    afterDatasetDraw(chart) {
        const chartType = chart.config.type;
        if (chartType !== "pie" && chartType !== "doughnut") return;

        const { ctx } = chart;
        const dataset = chart.data.datasets[0];
        const meta = chart.getDatasetMeta(0);
        const total = dataset.data.reduce(
            (sum, v, i) => (chart.getDataVisibility(i) ? sum + v : sum),
            0
        );
        if (!total) return;

        meta.data.forEach((arc, index) => {
            if (!chart.getDataVisibility(index)) return;

            const value = dataset.data[index];
            const label = chart.data.labels[index];
            const angle = (arc.startAngle + arc.endAngle) / 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            const labelOpts = chart.options.plugins?.externalLabelLines || {};
            const lineOut = labelOpts.lineOut ?? 14;
            const elbow = labelOpts.elbow ?? 28;
            const fontSize = labelOpts.fontSize ?? 11;

            const x0 = arc.x + cos * arc.outerRadius;
            const y0 = arc.y + sin * arc.outerRadius;
            const x1 = arc.x + cos * (arc.outerRadius + lineOut);
            const y1 = arc.y + sin * (arc.outerRadius + lineOut);
            const x2 = x1 + (cos >= 0 ? elbow : -elbow);
            const y2 = y1;

            const pct = ((value / total) * 100).toFixed(1);
            const text = labelOpts.percentOnly
                ? `${label} (${pct}%)`
                : labelOpts.compact
                  ? `${value} (${pct}%)`
                  : `${label}: ${value} (${pct}%)`;

            ctx.save();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            ctx.fillStyle = "#e8e8e8";
            ctx.font = `600 ${fontSize}px Segoe UI, system-ui, sans-serif`;
            ctx.textAlign = cos >= 0 ? "left" : "right";
            ctx.textBaseline = "middle";
            ctx.fillText(text, x2 + (cos >= 0 ? 5 : -5), y2);
            ctx.restore();
        });
    },
};

function buildChartWithExternalLabels(
    canvasId,
    chartKey,
    data,
    {
        doughnut = false,
        layoutPadding = null,
        externalLabels = true,
        compactExternalLabels = false,
        percentOnlyLabels = false,
        hideLegend = false,
        chartRadius = "100%",
        externalLabelStyle = null,
    } = {}
) {
    const canvas = $(canvasId);
    if (!canvas || !data?.labels?.length) return;

    const ctx = canvas.getContext("2d");
    const c = chartColors();
    if (charts[chartKey]) {
        charts[chartKey].destroy();
        charts[chartKey] = null;
    }

    const colors = data.labels.map((_, i) => c.palette[i % c.palette.length]);

    charts[chartKey] = new Chart(ctx, {
        type: doughnut ? "doughnut" : "pie",
        data: {
            labels: data.labels,
            datasets: [
                {
                    data: data.values,
                    backgroundColor: colors,
                    borderWidth: 1,
                    borderColor: "#1e1e2f",
                },
            ],
        },
        plugins: externalLabels ? [externalLabelLinesPlugin] : [],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            radius: chartRadius,
            cutout: doughnut ? "52%" : undefined,
            layout: {
                padding:
                    layoutPadding ||
                    (hideLegend
                        ? { top: 16, right: 72, bottom: 4, left: 72 }
                        : { top: 20, right: 72, bottom: 12, left: 72 }),
            },
            plugins: {
                externalLabelLines: {
                    compact: compactExternalLabels,
                    percentOnly: percentOnlyLabels,
                    ...(externalLabelStyle || {}),
                },
                legend: {
                    display: !hideLegend,
                    position: "bottom",
                    labels: {
                        color: c.text,
                        boxWidth: 12,
                        padding: 14,
                        font: { size: 11 },
                    },
                    onClick: (event, legendItem, legend) => {
                        const chart = legend.chart;
                        chart.toggleDataVisibility(legendItem.index);
                        chart.update();
                    },
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const visibleTotal = ctx.dataset.data.reduce((a, b, i) =>
                                ctx.chart.getDataVisibility(i) ? a + b : a
                            , 0);
                            const pct = visibleTotal
                                ? ((ctx.raw / visibleTotal) * 100).toFixed(1)
                                : "0";
                            if (percentOnlyLabels) {
                                return `${ctx.label}: ${pct}%`;
                            }
                            return `${ctx.label}: ${ctx.raw} (${pct}%)`;
                        },
                    },
                },
            },
        },
    });
}

function studentChartOptions() {
    return {
        doughnut: true,
        percentOnlyLabels: true,
        hideLegend: true,
        chartRadius: "60%",
        layoutPadding: { top: 22, right: 86, bottom: 14, left: 86 },
        externalLabelStyle: { lineOut: 12, elbow: 22, fontSize: 11 },
    };
}

function buildAgeChart(data) {
    buildChartWithExternalLabels("chart-age", "age", data, studentChartOptions());
}

function buildOriginChart(data) {
    buildChartWithExternalLabels("chart-origin", "origin", data, studentChartOptions());
}

function buildGenderChart(data) {
    buildChartWithExternalLabels("chart-gender", "gender", data, studentChartOptions());
}

function buildGradeChart(data) {
    const onCcPage = Boolean(window.CcStatisticsBootstrap);
    buildChartWithExternalLabels("chart-grade", "grade", data, {
        doughnut: true,
        compactExternalLabels: onCcPage,
        layoutPadding: onCcPage
            ? { top: 24, right: 92, bottom: 48, left: 92 }
            : undefined,
    });
}

function buildExamChart(data) {
    buildChartWithExternalLabels("chart-exam", "exam", data, studentChartOptions());
}

const GROUPED_BAR_COLORS = {
    Utilizzate: "#377EB8",
    "Postazioni utilizzate": "#377EB8",
};

function groupedBarChartSizing() {
    const large = window.matchMedia("(min-width: 1920px)").matches;
    return {
        barThickness: large ? 30 : 20,
        xTickSize: large ? 16 : 13,
        yTickSize: large ? 15 : 12,
        paddingRight: large ? 16 : 10,
    };
}

function buildGroupedBarChart(data) {
    const canvas = $("chart-cluster-grouped");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const c = chartColors();
    const sizing = groupedBarChartSizing();
    if (charts.grouped) {
        charts.grouped.destroy();
        charts.grouped = null;
    }

    const labels = data.labels || [];
    const datasets = (data.datasets || []).map((ds) => ({
        label: ds.label,
        data: ds.values,
        backgroundColor: GROUPED_BAR_COLORS[ds.label] || c.accent,
        borderRadius: { topRight: 6, bottomRight: 6 },
        maxBarThickness: sizing.barThickness,
    }));

    charts.grouped = new Chart(ctx, {
        type: "bar",
        data: { labels, datasets },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 4, right: sizing.paddingRight, bottom: 4, left: 4 } },
            plugins: {
                legend: { display: false },
            },
            scales: {
                x: {
                    type: "linear",
                    position: "bottom",
                    beginAtZero: true,
                    ticks: {
                        color: c.text,
                        stepSize: 1,
                        font: { size: sizing.xTickSize, weight: "600" },
                        maxTicksLimit: 8,
                    },
                    grid: { color: c.grid, drawTicks: false },
                },
                y: {
                    type: "category",
                    position: "left",
                    ticks: {
                        color: c.text,
                        font: { size: sizing.yTickSize, weight: "600" },
                        autoSkip: false,
                        padding: 8,
                    },
                    grid: { display: false },
                },
            },
        },
    });
}

function setLoading(on) {
    const el = $("loading-overlay");
    if (!el) return;
    el.classList.toggle("hidden", !on);
}

function setError(msg) {
    const el = $("error-banner");
    if (!el) return;
    if (msg) {
        el.textContent = msg;
        el.classList.add("visible");
    } else {
        el.textContent = "";
        el.classList.remove("visible");
    }
}

const AUTO_REFRESH_MS = 2 * 60 * 1000;

async function loadDashboard() {
    const boot = getBootstrap();
    setLoading(true);
    setError(null);

    try {
        const resolvedKpis = resolveKpis(boot);
        const groupedBars = boot?.clusterGroupedBars;
        const originChart = boot?.studentOriginChart;
        const ageChart = boot?.studentAgeChart;
        const genderChart = boot?.studentGenderChart;
        const examChart = boot?.studentExamChart;
        const gradeChart = boot?.studentGradeChart;
        const kpis = resolvedKpis
            ? resolvedKpis
            : await fetchOrDemo("kpi", demoKpis);

        const kpiList = Array.isArray(kpis) ? kpis : kpis.items || demoKpis();
        if (kpiList.length) renderKpis(kpiList);
        if (groupedBars?.labels?.length) buildGroupedBarChart(groupedBars);
        buildOriginChart(originChart);
        buildAgeChart(ageChart);
        buildGenderChart(genderChart);
        buildExamChart(examChart);
        if (gradeChart?.labels?.length) buildGradeChart(gradeChart);
    } catch (err) {
        console.error(err);
        setError(`Errore nel caricamento: ${err.message}`);
    } finally {
        setLoading(false);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadDashboard();

    const kiosk = window.StatisticsKioskBootstrap;
    console.log("kiosk", kiosk);
    if (kiosk && kiosk.nextPageUrl && window.KioskNavigation?.isEmbedded?.()) {
        window.KioskNavigation.publishPageDuration(kiosk.rotateAfterMs || 30000);
        return;
    }

    if (kiosk && kiosk.nextPageUrl && !window.KioskNavigation?.isEmbedded?.()) {
        const goNext = () => {
            window.KioskNavigation?.goToPage?.(kiosk.nextPageUrl, "forward")
                ?? (window.location.href = kiosk.nextPageUrl);
        };
        const delay = kiosk.rotateAfterMs || 30000;

        if (window.KioskNavigation?.createPausableTimeout) {
            window.KioskNavigation.createPausableTimeout(goNext, delay);
        } else {
            window.setTimeout(goNext, delay);
        }
        return;
    }

    if (!window.WorkstationsBootstrap && !window.CcStatisticsBootstrap) {
        setInterval(() => location.reload(), AUTO_REFRESH_MS);
    }
});
