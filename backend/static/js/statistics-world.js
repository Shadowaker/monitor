function getWorldBootstrap() {
    return window.WorldStatisticsBootstrap || {};
}

/** Paesi senza path SVG dedicato → conteggio sul paese host. */
const COUNTRY_COUNT_ALIASES = {
    SG: "MY",
};

function normalizeCampusCounts(raw) {
    const counts = { ...raw };
    Object.entries(COUNTRY_COUNT_ALIASES).forEach(([from, to]) => {
        const value = counts[from];
        if (!value) return;
        counts[to] = (counts[to] || 0) + value;
        delete counts[from];
    });
    return counts;
}

function parseHex(hex) {
    const normalized = hex.replace("#", "");
    return [
        parseInt(normalized.slice(0, 2), 16),
        parseInt(normalized.slice(2, 4), 16),
        parseInt(normalized.slice(4, 6), 16),
    ];
}

function lerpColor(t, fromHex, toHex) {
    const from = parseHex(fromHex);
    const to = parseHex(toHex);
    const mix = from.map((value, index) =>
        Math.round(value + (to[index] - value) * t)
    );
    return `#${mix.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function groupPathsByCountry(svg) {
    const groups = new Map();
    svg.querySelectorAll("path[id]").forEach((path) => {
        const code = path.id.trim();
        if (!code) return;
        if (!groups.has(code)) groups.set(code, []);
        groups.get(code).push(path);
    });
    return groups;
}

function unionBBox(paths) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    paths.forEach((path) => {
        const box = path.getBBox();
        minX = Math.min(minX, box.x);
        minY = Math.min(minY, box.y);
        maxX = Math.max(maxX, box.x + box.width);
        maxY = Math.max(maxY, box.y + box.height);
    });

    if (!Number.isFinite(minX)) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }

    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
    };
}

function markerRadius(bbox) {
    const side = Math.min(bbox.width, bbox.height);
    return Math.max(11, Math.min(24, side * 0.2));
}

function ensureMarkerLayer(svg) {
    let layer = svg.querySelector("#world-campus-markers");
    if (layer) layer.replaceChildren();
    else {
        layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
        layer.setAttribute("id", "world-campus-markers");
        svg.appendChild(layer);
    }
    return layer;
}

function createMarker(layer, x, y, count, radius) {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("class", "world-campus-marker");

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(x));
    circle.setAttribute("cy", String(y));
    circle.setAttribute("r", String(radius));

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(x));
    label.setAttribute("y", String(y));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dominant-baseline", "central");
    label.setAttribute("font-size", String(Math.max(10, Math.round(radius * 0.95))));
    label.textContent = String(count);

    group.appendChild(circle);
    group.appendChild(label);
    layer.appendChild(group);
}

function getHighlightCountry() {
    return String(getWorldBootstrap().highlightCountry || "").trim();
}

function resolveHighlightCountryCode(countryNames, highlightCountry) {
    if (!highlightCountry) return null;

    const target = highlightCountry.trim().toLowerCase();
    for (const [code, name] of Object.entries(countryNames || {})) {
        if (String(name).trim().toLowerCase() === target) {
            return code;
        }
    }

    const isoCode = highlightCountry.trim().toUpperCase();
    if (countryNames && countryNames[isoCode]) {
        return isoCode;
    }

    return null;
}

function resolveHighlightCountryName(countryNames, highlightCountry) {
    if (!highlightCountry) return "";

    const code = resolveHighlightCountryCode(countryNames, highlightCountry);
    if (code && countryNames?.[code]) {
        return countryNames[code];
    }

    return highlightCountry.trim();
}

function paintWorldMap() {
    const boot = getWorldBootstrap();
    const root = document.getElementById("world-svg-root");
    if (!root) return;

    const svg = root.querySelector("svg");
    if (!svg) return;

    const highlightCountry = getHighlightCountry();
    const highlightCountryCode = resolveHighlightCountryCode(
        boot.countryNames,
        highlightCountry
    );
    const campusCounts = normalizeCampusCounts(boot.campusCounts || {});
    const maxCount =
        Math.max(1, ...Object.values(campusCounts)) ||
        boot.maxCount ||
        1;
    const defaultFill = boot.defaultFill || "#ececec";
    const maxFill = boot.maxFill || "#04809F";
    const pathGroups = groupPathsByCountry(svg);
    const markerLayer = ensureMarkerLayer(svg);

    pathGroups.forEach((paths, code) => {
        const count = campusCounts[code] || 0;

        paths.forEach((path) => {
            path.classList.add("world-campus-country");
            if (highlightCountryCode && code === highlightCountryCode) {
                path.classList.add("world-campus-country--highlight");
            }
            if (count > 0) {
                const ratio = count / maxCount;
                path.setAttribute("fill", lerpColor(ratio, defaultFill, maxFill));
            } else {
                path.setAttribute("fill", defaultFill);
            }
        });

        if (count > 0) {
            const bbox = unionBBox(paths);
            const cx = bbox.x + bbox.width / 2;
            const cy = bbox.y + bbox.height / 2;
            createMarker(markerLayer, cx, cy, count, markerRadius(bbox));
        }
    });
}

const EUROPE_COUNTRIES = new Set([
    "Albania",
    "Austria",
    "Belgium",
    "Czech Republic",
    "France",
    "Germany",
    "Italy",
    "Luxembourg",
    "Poland",
    "Portugal",
    "Spain",
    "Switzerland",
    "The Netherlands",
    "United Kingdom",
]);

const CONTINENT_BY_COUNTRY = {
    Angola: "Africa",
    Armenia: "Asia",
    Brazil: "America",
    Canada: "America",
    Japan: "Asia",
    Jordan: "Asia",
    Lebanon: "Asia",
    Madagascar: "Africa",
    Malaysia: "Asia",
    Morocco: "Africa",
    Palestine: "Asia",
    Singapore: "Asia",
    "South Korea": "Asia",
    Thailand: "Asia",
    Turkey: "Asia",
    "United Arab Emirates": "Asia",
};

const CONTINENT_ORDER = ["America", "Africa", "Asia"];

function escapeHtml(value) {
    const decoded = String(value).replace(/&#(\d+);/g, (_, code) =>
        String.fromCharCode(Number(code))
    );
    return decoded
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function renderCountryPanel(country, schoolsByCountry, options = {}) {
    const campuses = (schoolsByCountry[country] || []).slice().sort((a, b) =>
        a.localeCompare(b, "it")
    );
    const items = campuses
        .map(
            (name) => `
            <li>
                <span class="world-stats-campus-list__name">${escapeHtml(name)}</span>
            </li>`
        )
        .join("");
    const highlightClass =
        options.highlightCountry &&
        country.localeCompare(options.highlightCountry, "it", {
            sensitivity: "accent",
        }) === 0
            ? " world-stats-country-panel--highlight"
            : "";
    return `
        <article class="world-stats-country-panel${highlightClass}">
            <h3>${escapeHtml(country)}</h3>
            <ul class="world-stats-campus-list">${items}</ul>
        </article>
    `;
}

function sidebarRenderOptions() {
    const boot = getWorldBootstrap();
    return {
        highlightCountry: resolveHighlightCountryName(
            boot.countryNames,
            getHighlightCountry()
        ),
    };
}

function renderEuropeColumn(countries, schoolsByCountry, options = {}) {
    const europeCountries = countries
        .filter((country) => EUROPE_COUNTRIES.has(country))
        .sort((a, b) => a.localeCompare(b, "it"));

    if (!europeCountries.length) return "";

    const countryPanels = europeCountries
        .map((country) => renderCountryPanel(country, schoolsByCountry, options))
        .join("");

    return `
        <div class="world-stats-continent-group">
            <h3 class="world-stats-continent-group__title">Europa</h3>
            ${countryPanels}
        </div>
    `;
}

function renderWorldColumn(countries, schoolsByCountry, options = {}) {
    const nonEurope = countries.filter((country) => !EUROPE_COUNTRIES.has(country));
    const byContinent = new Map(CONTINENT_ORDER.map((name) => [name, []]));

    nonEurope.forEach((country) => {
        const continent = CONTINENT_BY_COUNTRY[country] || "Asia";
        if (!byContinent.has(continent)) byContinent.set(continent, []);
        byContinent.get(continent).push(country);
    });

    return CONTINENT_ORDER.filter((continent) => byContinent.get(continent).length)
        .map((continent) => {
            const countryPanels = byContinent
                .get(continent)
                .sort((a, b) => a.localeCompare(b, "it"))
                .map((country) => renderCountryPanel(country, schoolsByCountry, options))
                .join("");
            return `
                <div class="world-stats-continent-group">
                    <h3 class="world-stats-continent-group__title">${continent}</h3>
                    ${countryPanels}
                </div>
            `;
        })
        .join("");
}

function renderHorizontalSchoolsList(countries, schoolsByCountry, options = {}) {
    const sorted = countries.slice().sort((a, b) => {
        const countDiff =
            (schoolsByCountry[b] || []).length - (schoolsByCountry[a] || []).length;
        if (countDiff !== 0) return countDiff;
        return a.localeCompare(b, "it");
    });
    const panels = sorted
        .map((country) => renderCountryPanel(country, schoolsByCountry, options))
        .join("");
    return `<div class="world-stats-schools-bottom__inner">${panels}</div>`;
}

function isVerticalSidebarLayout() {
    const main = document.querySelector(".world-stats-main");
    if (!main) return true;
    return !main.classList.contains("world-stats-main--horizontal");
}

function buildSchoolsSidebar() {
    const boot = getWorldBootstrap();
    const schoolsByCountry = boot.schoolsByCountry || {};
    const countries = Object.keys(schoolsByCountry);
    const vertical = isVerticalSidebarLayout();
    const empty = `<p class="world-stats-schools-empty">Elenco campus non disponibile.</p>`;

    if (vertical) {
        const europeList = document.getElementById("world-schools-europe");
        const worldList = document.getElementById("world-schools-world");
        if (!europeList || !worldList) return;

        if (!countries.length) {
            europeList.innerHTML = empty;
            worldList.innerHTML = "";
            return;
        }

        const options = sidebarRenderOptions();
        europeList.innerHTML = renderEuropeColumn(countries, schoolsByCountry, options);
        worldList.innerHTML = renderWorldColumn(countries, schoolsByCountry, options);
        return;
    }

    const allList = document.getElementById("world-schools-all");
    if (!allList) return;

    if (!countries.length) {
        allList.innerHTML = empty;
        return;
    }

    allList.innerHTML = renderHorizontalSchoolsList(
        countries,
        schoolsByCountry,
        sidebarRenderOptions()
    );
}

function initWorldStatisticsPage() {
    paintWorldMap();
    buildSchoolsSidebar();
}

document.addEventListener("DOMContentLoaded", () => {
    initWorldStatisticsPage();
    const boot = getWorldBootstrap();
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
