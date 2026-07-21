function getCcBootstrap() {
    return window.CcStatisticsBootstrap || {};
}

const MASTERY_STEP = "mastery";

function getRankGroup(rank) {
    return document.querySelector(`#cc-svg-root .cc-${rank}`);
}

function getMasteryGroup() {
    return document.querySelector("#cc-svg-root .cc-mastery");
}

function setupCcSvg() {
    const svg = document.querySelector("#cc-svg-root svg");
    if (!svg) return;

    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.removeAttribute("width");
    svg.removeAttribute("height");

    const boot = getCcBootstrap();
    const viewBox =
        boot.showMastery && !boot.masteryFullyVisible
            ? boot.ccOnlyViewBox
            : boot.fullViewBox;
    if (viewBox) {
        svg.setAttribute("viewBox", viewBox);
    }

    const wrap = svg.closest(".cc-stats-svg-wrap");
    wrap?.classList.toggle(
        "cc-stats-svg-wrap--with-mastery",
        boot.showMastery === true && boot.masteryFullyVisible === true
    );
}

function setRankVisualState(rank, state) {
    const group = getRankGroup(rank);
    if (!group) return;
    group.classList.remove("cc-rank-active", "cc-rank-past", "cc-rank-dim");
    if (state) group.classList.add(`cc-rank-${state}`);
}

function setMasteryVisualState(state) {
    const group = getMasteryGroup();
    if (!group) return;
    group.classList.remove("cc-rank-active", "cc-rank-past", "cc-rank-dim");
    if (state) group.classList.add(`cc-rank-${state}`);
}

function resetAllRanks(ranks) {
    ranks.forEach((rank) => setRankVisualState(rank, "dim"));
    setMasteryVisualState("dim");
}

function updatePanel(step, rankCounts) {
    const title = document.getElementById("cc-rank-title");
    const countEl = document.getElementById("cc-rank-count");
    if (!title || !countEl) return;

    if (step === MASTERY_STEP) {
        const count = rankCounts.advanced_core ?? 0;
        title.textContent = "Advanced Core";
        countEl.textContent = count === 1 ? "1 studente" : `${count} studenti`;
        return;
    }

    const count = rankCounts[String(step)] ?? 0;
    if (`${step}` === "1") {
        title.textContent = "Cerchio 1 (C)";
    } else if (`${step}` === "2") {
        title.textContent = "Cerchio 2 (Python & Virtual Machines)";
    } else if (`${step}` === "3") {
        title.textContent = "Cerchio 3 (C & Python)";
    } else if (`${step}` === "4") {
        title.textContent = "Cerchio 4 (Python & Reti)";
    } else if (`${step}` === "5") {
        title.textContent = "Cerchio 5 (Python & DevOps)";
    } else if (`${step}` === "6") {
        title.textContent = "Cerchio 6 (Open Language)";
    } else {
        title.textContent = `Cerchio ${step}`;
    }
    countEl.textContent = count === 1 ? "1 studente" : `${count} studenti`;
}

function buildLegend(ranks, rankCounts) {
    const list = document.getElementById("cc-rank-legend");
    if (!list) return;

    const items = ranks.map((rank) => {
        const count = rankCounts[String(rank)] ?? 0;

        if (`${rank}` === "1") {
            return `<li data-rank="${rank}"><span>Cerchio ${rank} (C)</span><span>${count}</span></li>`;
        } else if (`${rank}` === "2") {
            return `<li data-rank="${rank}"><span>Cerchio ${rank} (Python & Virtual Machines)</span><span>${count}</span></li>`;
        } else if (`${rank}` === "3") {
            return `<li data-rank="${rank}"><span>Cerchio ${rank} (C & Python)</span><span>${count}</span></li>`;
        } else if (`${rank}` === "4") {
            return `<li data-rank="${rank}"><span>Cerchio ${rank} (Python & Reti)</span><span>${count}</span></li>`;
        } else if (`${rank}` === "5") {
            return `<li data-rank="${rank}"><span>Cerchio ${rank} (Python & DevOps)</span><span>${count}</span></li>`;
        } else if (`${rank}` === "6") {
            return `<li data-rank="${rank}"><span>Cerchio ${rank} (Open Language)</span><span>${count}</span></li>`;
        }
        return `<li data-rank="${rank}"><span>Cerchio ${rank}</span><span>${count}</span></li>`;
    });

    const advancedCount = rankCounts.advanced_core ?? 0;
    items.push(
        `<li data-rank="${MASTERY_STEP}"><span>Advanced Core</span><span>${advancedCount}</span></li>`
    );

    list.innerHTML = items.join("");
}

function highlightLegend(step) {
    document.querySelectorAll("#cc-rank-legend li").forEach((item) => {
        const itemStep =
            item.dataset.rank === MASTERY_STEP
                ? MASTERY_STEP
                : Number(item.dataset.rank);
        item.classList.toggle("cc-legend-active", itemStep === step);
    });
}

function showCycleStep(step, ranks) {
    if (step === MASTERY_STEP) {
        ranks.forEach((rank) => setRankVisualState(rank, "past"));
        setMasteryVisualState("active");
        return;
    }

    setMasteryVisualState("dim");
    ranks.forEach((rank) => {
        if (rank < step) setRankVisualState(rank, "past");
        else if (rank === step) setRankVisualState(rank, "active");
        else setRankVisualState(rank, "dim");
    });
}

function goToKioskPage(url, direction) {
    if (window.KioskNavigation?.goToPage) {
        window.KioskNavigation.goToPage(url, direction);
        return;
    }
    try {
        sessionStorage.setItem("kiosk_entry_direction", direction);
    } catch (error) {
        // ignore storage errors
    }
    window.location.href = url;
}

function getInitialCycleIndex(steps) {
    const boot = getCcBootstrap();
    const entryDirection = window.KioskNavigation?.consumeEntryDirection?.()
        || consumeKioskEntryDirectionFallback();

    if (entryDirection === "back" && boot.backNavStartFromEnd) {
        return steps.length - 1;
    }
    return 0;
}

function consumeKioskEntryDirectionFallback() {
    try {
        const direction = sessionStorage.getItem("kiosk_entry_direction") || "forward";
        sessionStorage.removeItem("kiosk_entry_direction");
        return direction;
    } catch (error) {
        return "forward";
    }
}

function registerCycleController(controller) {
    window.KioskNavigation?.registerCycleController?.(controller);
}

function formatLogTime(date) {
    return date.toLocaleTimeString("it-IT", { hour12: false });
}

function logCcTiming(steps, stepMs) {
    const stepSeconds = stepMs / 1000;
    const stepCount = steps.length;
    const totalMs = stepMs * stepCount;
    const totalSeconds = totalMs / 1000;
    const startedAt = new Date();
    const expectedEndAt = new Date(startedAt.getTime() + totalMs);
    const message =
        `[CC timing] cerchio: ${stepSeconds}s | cerchi: ${stepCount} | totale previsto: ${totalSeconds}s (${totalMs}ms) | inizio: ${formatLogTime(startedAt)} | fine prevista: ${formatLogTime(expectedEndAt)}`;

    console.log(message);
    console.info(message);
    return startedAt;
}

function logCcTimingComplete(steps, stepMs, startedAt) {
    const endedAt = new Date();
    const elapsedMs = endedAt.getTime() - startedAt.getTime();
    const elapsedSeconds = (elapsedMs / 1000).toFixed(1);
    const expectedMs = stepMs * steps.length;
    const deltaMs = elapsedMs - expectedMs;
    const deltaSeconds = (deltaMs / 1000).toFixed(1);
    const deltaLabel = deltaMs >= 0 ? `+${deltaSeconds}s` : `${deltaSeconds}s`;

    console.log(
        `[CC timing] fine: ${formatLogTime(endedAt)} | durata reale: ${elapsedSeconds}s | prevista: ${expectedMs / 1000}s | differenza: ${deltaLabel}`
    );
    console.info(
        `[CC timing] fine: ${formatLogTime(endedAt)} | durata reale: ${elapsedSeconds}s | prevista: ${expectedMs / 1000}s | differenza: ${deltaLabel}`
    );
}

function createRankCycle() {
    const boot = getCcBootstrap();
    const ranks = boot.ranks || [1, 2, 3, 4, 5, 6];
    const rankCounts = boot.rankCounts || {};
    const stepMs = boot.stepDurationMs || 8000;
    const steps = boot.showMastery ? [...ranks, MASTERY_STEP] : ranks;
    const prevPageUrl = boot.prevPageUrl || null;
    const nextPageUrl = boot.nextPageUrl || null;

    let currentIndex = getInitialCycleIndex(steps);
    let timer = null;
    let cycleStartedAt = null;

    function stopTimer() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }

    function displayIndex(index) {
        const step = steps[index];
        showCycleStep(step, ranks);
        updatePanel(step, rankCounts);
        highlightLegend(step);
    }

    function goToIndex(index) {
        if (index < 0) {
            stopTimer();
            if (prevPageUrl) goToKioskPage(prevPageUrl, "back");
            return;
        }
        if (index >= steps.length) {
            stopTimer();
            if (cycleStartedAt) {
                logCcTimingComplete(steps, stepMs, cycleStartedAt);
            }
            if (nextPageUrl) goToKioskPage(nextPageUrl, "forward");
            return;
        }

        currentIndex = index;
        displayIndex(currentIndex);
    }

    function resetTimer() {
        stopTimer();
        timer = window.setInterval(() => {
            goToIndex(currentIndex + 1);
        }, stepMs);
    }

    function step(delta) {
        goToIndex(currentIndex + delta);
        if (currentIndex >= 0 && currentIndex < steps.length) {
            resetTimer();
        }
    }

    function pauseCycle() {
        stopTimer();
    }

    function resumeCycle() {
        if (currentIndex >= 0 && currentIndex < steps.length) {
            resetTimer();
        }
    }

    function start() {
        cycleStartedAt = logCcTiming(steps, stepMs);
        buildLegend(ranks, rankCounts);
        resetAllRanks(ranks);
        goToIndex(currentIndex);
        resetTimer();
        registerCycleController({ pause: pauseCycle, resume: resumeCycle });
    }

    return { start, step, pause: pauseCycle, resume: resumeCycle };
}

document.addEventListener("DOMContentLoaded", () => {
    setupCcSvg();
    const cycle = createRankCycle();
    cycle.start();

    window.KioskNavigation = window.KioskNavigation || {};
    window.KioskNavigation.onTapLeft = () => {
        cycle.step(-1);
        return true;
    };
    window.KioskNavigation.onTapRight = () => {
        cycle.step(1);
        return true;
    };
});
