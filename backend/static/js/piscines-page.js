const HIRING_CC_FRACTION = 0.8;

const FUNNEL_VIEWBOX = {
    x: -284.042,
    y: -144.94,
    width: 914.057,
    height: 394.441,
};

const FUNNEL_SEGMENT_POINTS = [
    [
        [-284.042, -144.94],
        [-56.354, -109.407],
        [-55.033, 216.238],
        [-281.484, 249.501],
    ],
    [
        [173.479, -58.243],
        [-55.747, -95.332],
        [-55.179, 198.222],
        [173.817, 163.128],
    ],
    [
        [401.02, -12.114],
        [173.875, -48.906],
        [173.737, 152.364],
        [400.521, 116.025],
    ],
    [
        [630.015, 27.455],
        [401.208, 5.022],
        [400.53, 102.571],
        [629.784, 81.523],
    ],
];

const COMMON_CORE_BOUNDS = { left: 173.875, right: 401.02 };

const FUNNEL_COLORS = {
    fill: [
        "rgba(4, 128, 159, 0.95)",
        "rgba(0, 154, 171, 0.95)",
        "rgba(0, 186, 188, 0.95)",
        "rgba(94, 240, 242, 0.9)",
    ],
    stroke: ["#04809F", "#009aab", "#00babc", "#5ef0f2"],
    text: ["#ffffff", "#ffffff", "#ffffff", "#1e1e2f"],
};

const FUNNEL_STAGE_DETAILS = [
    {
        title: "Primo screening",
        lines: ["2h", "Logico-attitudinale"],
    },
    {
        title: "Selezione",
        lines: ["4 settimane FT", "16 progetti; 4 esami"],
    },
    {
        title: "Percorso principale",
        lines: ["Circa 8-24 mesi", "24 progetti; 5 esami"],
    },
    {
        title: "Specializzazione",
        lines: ["Circa 18-24 mesi", "10+ specializzazioni avanzate"],
    },
];

function getPiscinesBootstrap() {
    return window.PiscinesBootstrap || {};
}

function formatCount(value) {
    return Number(value ?? 0).toLocaleString("it-IT");
}

function formatSegmentValue(index, value) {
    const formatted = formatCount(value);
    if (index === 0) {
        return `${formatted}*`;
    }
    return formatted;
}

function pointsToPath(points) {
    const [first, ...rest] = points;
    const segments = rest.map(([x, y]) => `L ${x} ${y}`).join(" ");
    return `M ${first[0]} ${first[1]} ${segments} Z`;
}

function polygonCentroid(points) {
    const count = points.length;
    const sum = points.reduce(
        (acc, [x, y]) => {
            acc.x += x;
            acc.y += y;
            return acc;
        },
        { x: 0, y: 0 }
    );
    return { x: sum.x / count, y: sum.y / count };
}

function hiringStartPercent() {
    const startX =
        COMMON_CORE_BOUNDS.left +
        HIRING_CC_FRACTION * (COMMON_CORE_BOUNDS.right - COMMON_CORE_BOUNDS.left);
    return ((startX - FUNNEL_VIEWBOX.x) / FUNNEL_VIEWBOX.width) * 100;
}

function renderFunnelStats(stats) {
    const list = document.getElementById("piscines-funnel-stats");
    if (!list) return;

    list.innerHTML = stats.map((line) => `<li>${line}</li>`).join("");
}

function renderFunnelStageLabels(labels) {
    const row = document.getElementById("piscines-funnel-stage-labels");
    if (!row) return;

    row.innerHTML = labels
        .map(
            (label) =>
                `<div class="piscines-funnel-stage-labels__cell"><span>${label}</span></div>`
        )
        .join("");
}

function renderFunnelStageDetails(labels) {
    const row = document.getElementById("piscines-funnel-stage-details");
    if (!row) return;

    row.innerHTML = labels
        .map((_label, index) => {
            const detail = FUNNEL_STAGE_DETAILS[index] || { title: "", lines: [] };
            const lines = detail.lines.map((line) => `<p>${line}</p>`).join("");
            return `
                <article class="piscines-funnel-stage-details__cell">
                    <p class="piscines-funnel-stage-details__title">${detail.title}</p>
                    ${lines}
                </article>`;
        })
        .join("");
}

function renderFunnelSvg(displayCounts) {
    const svg = document.getElementById("piscines-funnel-svg");
    if (!svg) return;

    svg.setAttribute(
        "viewBox",
        `${FUNNEL_VIEWBOX.x} ${FUNNEL_VIEWBOX.y} ${FUNNEL_VIEWBOX.width} ${FUNNEL_VIEWBOX.height}`
    );

    const parts = FUNNEL_SEGMENT_POINTS.map((points, index) => {
        const { x, y } = polygonCentroid(points);
        const valueText = formatSegmentValue(index, displayCounts[index]);

        const shape = `
            <path
                d="${pointsToPath(points)}"
                fill="${FUNNEL_COLORS.fill[index]}"
                stroke="${FUNNEL_COLORS.stroke[index]}"
                stroke-width="2"
                vector-effect="non-scaling-stroke"
            ></path>`;

        if (index === 0) {
            return `${shape}
                <text
                    x="${x}"
                    y="${y - 14}"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    class="piscines-funnel-svg__value"
                    fill="${FUNNEL_COLORS.text[index]}"
                >${valueText}</text>
                <text
                    x="${x}"
                    y="${y + 20}"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    class="piscines-funnel-svg__subtitle"
                    fill="${FUNNEL_COLORS.text[index]}"
                >CANDIDATI</text>`;
        }

        return `${shape}
            <text
                x="${x}"
                y="${y}"
                text-anchor="middle"
                dominant-baseline="middle"
                class="piscines-funnel-svg__value"
                fill="${FUNNEL_COLORS.text[index]}"
            >${valueText}</text>`;
    });

    svg.innerHTML = parts.join("");
}

function initHorizontalFunnel() {
    const boot = getPiscinesBootstrap();
    const labels = boot.funnelLabels || [
        "Test online",
        "Piscine",
        "Common Core",
        "Advanced Core",
    ];
    const displayCounts = boot.funnelDisplayCounts || [9000, 2100, 830, 190];
    const stats = boot.funnelStats || [];

    const hiring = document.querySelector(".piscines-funnel-hiring");
    if (hiring) {
        hiring.style.setProperty("--hiring-start", `${hiringStartPercent()}%`);
    }

    renderFunnelStats(stats);
    renderFunnelStageLabels(labels);
    renderFunnelStageDetails(labels);
    renderFunnelSvg(displayCounts);
}

function initApplyQrCode() {
    const boot = getPiscinesBootstrap();
    const container = document.getElementById("piscines-apply-qr");
    if (!container || typeof QRCode === "undefined") return;

    const url = boot.applyUrl || "https://apply.42roma.it/";
    container.innerHTML = "";
    new QRCode(container, {
        text: url,
        width: 132,
        height: 132,
        colorDark: "#1e1e2f",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H,
    });
}

function initPiscinesPage() {
    initHorizontalFunnel();
    initApplyQrCode();
}

document.addEventListener("DOMContentLoaded", () => {
    initPiscinesPage();
    const boot = getPiscinesBootstrap();
    const delay = boot.rotateAfterMs || 30 * 1000;

    if (window.KioskNavigation?.isEmbedded?.()) {
        window.KioskNavigation.publishPageDuration(delay);
        return;
    }

    if (!boot.nextPageUrl) return;

    const goNext = () => {
        window.KioskNavigation?.goToPage?.(boot.nextPageUrl, "forward")
            ?? (window.location.href = boot.nextPageUrl);
    };

    if (window.KioskNavigation?.createPausableTimeout) {
        window.KioskNavigation.createPausableTimeout(goNext, delay);
        return;
    }

    window.setTimeout(goNext, delay);
});
