function getEventsBootstrap() {
    return window.EventsBootstrap || {};
}

function countSlides(slider) {
    return slider?.querySelectorAll(".event-card").length || 0;
}

function slideHeight(slider) {
    if (!slider) return 0;
    return slider.getBoundingClientRect().height;
}

function updateIndicators(slider, activeIndex) {
    const carousel = slider.closest(".event-carousel");
    if (!carousel) return;
    carousel.querySelectorAll(".slide-indicator").forEach((indicator, index) => {
        indicator.classList.toggle("active", index === activeIndex);
    });
}

function setupIndicators(slider) {
    const slides = slider.querySelectorAll(".event-card");
    const carousel = slider.closest(".event-carousel");
    if (!carousel || slides.length <= 1) return;

    const existing = carousel.querySelector(".slide-indicators");
    if (existing) existing.remove();

    const indicatorsContainer = document.createElement("div");
    indicatorsContainer.className = "slide-indicators";

    slides.forEach((_, index) => {
        const indicator = document.createElement("div");
        indicator.className = "slide-indicator";
        if (index === 0) indicator.classList.add("active");
        indicatorsContainer.appendChild(indicator);
    });

    carousel.appendChild(indicatorsContainer);
}

function goToSlide(slider, index) {
    if (!slider) return;
    const total = countSlides(slider);
    if (!total) return;
    const height = slideHeight(slider);
    slider.style.transform = `translateY(-${index * height}px)`;
    updateIndicators(slider, index);
}

function formatDate(dateStr) {
    const months = [
        "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
        "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
    ];
    const date = new Date(dateStr);
    return `${date.getDate()} ${months[date.getMonth()]}`;
}

function formatEventTime(iso) {
    if (!iso || typeof iso !== "string") return "—";
    const match = iso.match(/T(\d{2}:\d{2})/);
    return match ? match[1] : iso.substring(11, 16);
}

function formatEventTime(iso) {
    if (!iso || typeof iso !== "string") return "—";
    const match = iso.match(/T(\d{2}:\d{2})/);
    return match ? match[1] : iso.substring(11, 16);
}

function getEventColor(kind) {
    const kindLower = (kind || "").toLowerCase();
    if (["rush", "piscine", "partnership", "exam"].includes(kindLower)) return "var(--color-exam)";
    if (["conference", "meetup", "meet_up", "event"].includes(kindLower)) return "var(--color-event)";
    if (kindLower === "association") return "var(--color-association)";
    if (["hackaton", "workshop", "challenge"].includes(kindLower)) return "var(--color-hackathon)";
    if (kindLower === "extern") return "var(--color-extern)";
    return "var(--bg-box)";
}

function sanitizeId(str) {
    return str.replace(/[^a-z0-9]/gi, "-").toLowerCase();
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}

function createEventCard(event, idSuffix = "") {
    const backgroundColor = getEventColor(event.kind);
    const qrId = event.link ? `${sanitizeId(event.name)}${idSuffix}` : "";

    return `
        <div class="event-card" style="background-color: ${backgroundColor}; color: white;">
            <h4 class="event-title">${escapeHtml(event.name)}</h4>
            <div class="event-card__body">
                <p class="event-description">${escapeHtml(event.description || event.name)}</p>
            </div>
            <footer class="event-card__footer">
                <div class="event-card__meta event-card__meta--left">
                    <span class="event-card__label">Luogo</span>
                    <span class="event-card__value">${escapeHtml(event.location || "—")}</span>
                </div>
                <div class="event-card__meta event-card__meta--right">
                    <span class="event-card__label">Data</span>
                    <span class="event-card__value">
                        ${formatDate(event.start_date || event.begin_at)}<br>
                        ${formatEventTime(event.begin_at)}-${formatEventTime(event.end_at)}
                    </span>
                </div>
                ${event.link ? `
                <div class="event-card__qr">
                    <div id="qrcode-${qrId}" class="qrcode"></div>
                </div>` : ""}
            </footer>
        </div>
    `;
}

function generateQrCodes(events, idSuffix = "") {
    events.forEach((event) => {
        if (!event.link) return;
        const qrId = `${sanitizeId(event.name)}${idSuffix}`;
        const container = document.getElementById(`qrcode-${qrId}`);
        if (!container) return;
        container.innerHTML = "";
        new QRCode(container, {
            text: event.link,
            width: 90,
            height: 90,
            colorDark: "#FFFFFF",
            colorLight: "#00000000",
            correctLevel: QRCode.CorrectLevel.H,
        });
    });
}

function getEventStartTime(event) {
    const raw = event?.begin_at || event?.start_date;
    if (!raw) return 0;
    const ts = Date.parse(raw);
    return Number.isNaN(ts) ? 0 : ts;
}

function sortEventsChronologically(events) {
    return [...events].sort((a, b) => getEventStartTime(a) - getEventStartTime(b));
}

/** Split alternato: sinistra 1°, 3°, 5°… — destra 2°, 4°, 6°… (entrambe partono dal più vicino). */
function splitIntraEvents(events) {
    const sorted = sortEventsChronologically(events);
    const n = sorted.length;
    if (n <= 1) {
        return { left: sorted, right: [], split: false };
    }
    const left = [];
    const right = [];
    sorted.forEach((event, index) => {
        if (index % 2 === 0) left.push(event);
        else right.push(event);
    });
    return { left, right, split: right.length > 0 };
}

function renderSlider(slider, events, idSuffix) {
    if (!slider) return;
    if (!events.length) {
        slider.innerHTML = "";
        return;
    }
    slider.innerHTML = events.map((event) => createEventCard(event, idSuffix)).join("");
    generateQrCodes(events, idSuffix);
}

function renderEmptyIntra(slider) {
    if (!slider) return;
    slider.innerHTML = `
        <div class="event-card" style="background-color: var(--bg-box); color: white;">
            <h4 class="event-title">Nessun evento in programma</h4>
            <div class="event-card__body">
                <p class="event-description">Non ci sono eventi Intra nei prossimi giorni.</p>
            </div>
        </div>`;
}

function populateIntraPanels(events) {
    const leftSlider = document.getElementById("eventSlider");
    const rightPanel = document.getElementById("intraPanelRight");
    const rightSlider = document.getElementById("eventSliderRight");
    const body = document.body;

    if (!events?.length) {
        renderEmptyIntra(leftSlider);
        if (rightPanel) rightPanel.hidden = true;
        body.classList.remove("events-page--split-intra");
        return { mode: "empty", leftCount: 1, rightCount: 0 };
    }

    if (events.length === 1) {
        renderSlider(leftSlider, events, "-l0");
        if (rightPanel) rightPanel.hidden = true;
        body.classList.remove("events-page--split-intra");
        return { mode: "single", leftCount: 1, rightCount: 0 };
    }

    const { left, right, split } = splitIntraEvents(events);
    renderSlider(leftSlider, left, "-l");
    if (split && rightPanel && rightSlider) {
        rightPanel.hidden = false;
        renderSlider(rightSlider, right, "-r");
        body.classList.add("events-page--split-intra");
        return { mode: "intra-split", leftCount: left.length, rightCount: right.length };
    }

    renderSlider(leftSlider, events, "-l0");
    if (rightPanel) rightPanel.hidden = true;
    body.classList.remove("events-page--split-intra");
    return { mode: "single", leftCount: 1, rightCount: 0 };
}

function calculateFontSize(textLength, containerWidth = null) {
    const maxLength = 750;
    const maxFontSize = 2;
    const minFontSize = 0.8;
    if (textLength <= maxLength) return maxFontSize;

    const textRatio = textLength / maxLength;
    let widthFactor = 1;
    if (containerWidth) {
        const optimalWidth = containerWidth * 0.8;
        const estimatedTextWidth = textLength * 0.6;
        widthFactor = Math.min(estimatedTextWidth / optimalWidth, 2);
    }

    const reductionFactor = Math.min(textRatio * widthFactor, 4);
    return Math.max(maxFontSize / reductionFactor, minFontSize);
}

function applyDynamicFontSizing() {
    document.querySelectorAll(".event-description").forEach((description) => {
        const textLength = description.textContent.length;
        const containerWidth = description.offsetWidth;
        const fontSize = calculateFontSize(textLength, containerWidth);
        description.style.fontSize = `${fontSize}rem`;
    });
}

function initAnnouncementQrCodes() {
    const boot = getEventsBootstrap();
    boot.announcements?.forEach((announcement, index) => {
        if (!announcement.link) return;
        const qrContainer = document.getElementById(`qrcode-announcement-${index + 1}`);
        if (!qrContainer) return;
        new QRCode(qrContainer, {
            text: announcement.link,
            width: 100,
            height: 100,
            colorDark: "#FFFFFF",
            colorLight: "#00000000",
            correctLevel: QRCode.CorrectLevel.H,
        });
    });
}

function redirectToNextPage() {
    const boot = getEventsBootstrap();
    if (!boot.nextPageUrl) return;
    window.KioskNavigation?.goToPage?.(boot.nextPageUrl, "forward")
        ?? (window.location.href = boot.nextPageUrl);
}

let eventsCycle = null;

function registerCycleController(controller) {
    window.KioskNavigation?.registerCycleController?.(controller);
}

function createSyncedEventsCycle(columns, { stepDurationMs, prevPageUrl, nextPageUrl }) {
    const activeColumns = columns.filter(({ slider, count }) => slider && count > 0);
    const maxSteps = Math.max(1, ...activeColumns.map((column) => column.count));
    let currentStep = 0;
    let timer = null;

    function stopTimer() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }

    function renderStep(step) {
        activeColumns.forEach(({ slider, count }) => {
            goToSlide(slider, Math.min(step, count - 1));
        });
        applyDynamicFontSizing();
    }

    function goToStep(step) {
        if (step < 0) {
            stopTimer();
            if (prevPageUrl) {
                window.KioskNavigation?.goToPage?.(prevPageUrl, "back")
                    ?? (window.location.href = prevPageUrl);
            }
            return;
        }
        if (step >= maxSteps) {
            stopTimer();
            redirectToNextPage();
            return;
        }
        currentStep = step;
        renderStep(currentStep);
    }

    function resetTimer() {
        stopTimer();
        timer = window.setInterval(() => goToStep(currentStep + 1), stepDurationMs);
    }

    function step(delta) {
        goToStep(currentStep + delta);
        if (currentStep >= 0 && currentStep < maxSteps) {
            resetTimer();
        }
    }

    function pauseCycle() {
        stopTimer();
    }

    function resumeCycle() {
        if (currentStep >= 0 && currentStep < maxSteps) {
            resetTimer();
        }
    }

    function start() {
        activeColumns.forEach(({ slider }) => {
            if (!slider) return;
            slider.style.transform = "translateY(0px)";
            setupIndicators(slider);
        });
        goToStep(0);
        resetTimer();
        registerCycleController({ pause: pauseCycle, resume: resumeCycle });
    }

    return { start, step, pause: pauseCycle, resume: resumeCycle };
}

function registerEventsKioskHandlers() {
    window.KioskNavigation = window.KioskNavigation || {};
    window.KioskNavigation.onTapLeft = () => {
        eventsCycle?.step(-1);
        return true;
    };
    window.KioskNavigation.onTapRight = () => {
        eventsCycle?.step(1);
        return true;
    };
}

function startBdeSyncedCycle() {
    const boot = getEventsBootstrap();
    const slideDurationMs = boot.slideDurationMs || 15000;
    const intraSlider = document.getElementById("eventSlider");
    const bdeSlider = document.getElementById("announcementSlider");

    const events = sortEventsChronologically(boot.eventsData || []);
    renderSlider(intraSlider, events, "-bde");

    const intraCount = Math.max(countSlides(intraSlider), 1);
    const bdeCount = Math.max(countSlides(bdeSlider), 1);

    eventsCycle = createSyncedEventsCycle(
        [
            { slider: intraSlider, count: intraCount },
            { slider: bdeSlider, count: bdeCount },
        ],
        {
            stepDurationMs: slideDurationMs,
            prevPageUrl: boot.prevPageUrl,
            nextPageUrl: boot.nextPageUrl,
        }
    );
    eventsCycle.start();
}

function startIntraOnlyCycle(layout) {
    const boot = getEventsBootstrap();
    const slideDurationMs = boot.slideDurationMs || 15000;
    const leftSlider = document.getElementById("eventSlider");
    const rightSlider = document.getElementById("eventSliderRight");

    const columns = [{ slider: leftSlider, count: layout.leftCount }];
    if (layout.mode === "intra-split" && layout.rightCount > 0) {
        columns.push({ slider: rightSlider, count: layout.rightCount });
    }

    eventsCycle = createSyncedEventsCycle(columns, {
        stepDurationMs: slideDurationMs,
        prevPageUrl: boot.prevPageUrl,
        nextPageUrl: boot.nextPageUrl,
    });
    eventsCycle.start();
}

function startEventsCycle() {
    const boot = getEventsBootstrap();

    if (boot.hasCustomAnnouncements) {
        startBdeSyncedCycle();
        return;
    }

    const layout = populateIntraPanels(sortEventsChronologically(boot.eventsData || []));
    startIntraOnlyCycle(layout);
}

document.addEventListener("DOMContentLoaded", () => {
    initAnnouncementQrCodes();
    registerEventsKioskHandlers();

    setTimeout(() => {
        applyDynamicFontSizing();
        startEventsCycle();
    }, 200);

    let resizeTimeout;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(applyDynamicFontSizing, 250);
    });
});
