const KIOSK_ENTRY_KEY = "kiosk_entry_direction";
const KIOSK_PAUSED_KEY = "kiosk_paused";
const GPIO_COMMAND_GAP_MS = 100;
const cycleControllers = new Set();

let brightSignGpioReady = false;
let lastBrightSignCommandAt = 0;

function loadKioskPausedState() {
    try {
        return sessionStorage.getItem(KIOSK_PAUSED_KEY) === "true";
    } catch (error) {
        return false;
    }
}

function persistKioskPausedState(paused) {
    try {
        sessionStorage.setItem(KIOSK_PAUSED_KEY, paused ? "true" : "false");
    } catch (error) {
        // ignore storage errors (es. modalità privata)
    }
}

let kioskPaused = loadKioskPausedState();

function getKioskNavigation() {
    return window.KioskNavigation || {};
}

function markKioskEntryDirection(direction) {
    try {
        sessionStorage.setItem(KIOSK_ENTRY_KEY, direction);
    } catch (error) {
        // ignore storage errors (es. modalità privata)
    }
}

function consumeKioskEntryDirection() {
    try {
        const direction = sessionStorage.getItem(KIOSK_ENTRY_KEY) || "forward";
        sessionStorage.removeItem(KIOSK_ENTRY_KEY);
        return direction;
    } catch (error) {
        return "forward";
    }
}

function goToKioskPage(url, direction) {
    if (!url) {
        return;
    }

    if (isKioskEmbedded()) {
        window.parent.postMessage(
            { type: "kiosk-page-complete", direction, url },
            window.location.origin
        );
        return;
    }

    markKioskEntryDirection(direction);
    window.location.replace(url);
}

function isKioskEmbedded() {
    try {
        // Solo le pagine caricate nel player iframe (?embed=1).
        // Non usare self !== top: su BrightSign è true anche sul player shell.
        return new URLSearchParams(window.location.search).get("embed") === "1";
    } catch (error) {
        return false;
    }
}

function publishKioskPageDuration(durationMs) {
    if (!isKioskEmbedded() || !durationMs) {
        return;
    }
    window.parent.postMessage(
        {
            type: "kiosk-page-duration",
            duration_ms: Math.max(1, Math.round(durationMs)),
        },
        window.location.origin
    );
}

function registerCycleController(controller) {
    if (!controller || typeof controller !== "object") {
        return () => {};
    }

    cycleControllers.add(controller);
    if (kioskPaused) {
        controller.pause?.();
    }

    return () => {
        cycleControllers.delete(controller);
    };
}

function setKioskPaused(nextPaused) {
    kioskPaused = Boolean(nextPaused);
    persistKioskPausedState(kioskPaused);
    applyKioskPausedUi();

    cycleControllers.forEach((controller) => {
        if (kioskPaused) {
            controller.pause?.();
        } else {
            controller.resume?.();
        }
    });
}

function toggleKioskPause() {
    setKioskPaused(!kioskPaused);
}

function isKioskPaused() {
    return kioskPaused;
}

function createPausableTimeout(callback, delayMs) {
    let timerId = null;
    let remainingMs = Math.max(0, delayMs);
    let startedAt = 0;

    function clear() {
        if (timerId) {
            clearTimeout(timerId);
            timerId = null;
        }
    }

    function arm() {
        if (kioskPaused || remainingMs <= 0) {
            return;
        }
        clear();
        startedAt = Date.now();
        timerId = window.setTimeout(() => {
            timerId = null;
            callback();
        }, remainingMs);
    }

    function pause() {
        if (!timerId) {
            return;
        }
        remainingMs = Math.max(0, remainingMs - (Date.now() - startedAt));
        clear();
    }

    function resume() {
        if (timerId || remainingMs <= 0) {
            return;
        }
        arm();
    }

    const unregister = registerCycleController({ pause, resume });
    arm();

    return {
        pause,
        resume,
        cancel() {
            unregister();
            clear();
        },
    };
}

function canNavigatePrev(nav) {
    return Boolean(nav.prevPageUrl || typeof nav.onTapLeft === "function");
}

function canNavigateNext(nav) {
    return Boolean(nav.nextPageUrl || typeof nav.onTapRight === "function");
}

function ensureNavZones() {
    if (document.querySelector(".kiosk-nav-zones")) {
        return document.querySelector(".kiosk-nav-zones");
    }

    const wrap = document.createElement("div");
    wrap.className = "kiosk-nav-zones";
    wrap.setAttribute("aria-hidden", "true");

    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "kiosk-nav-zone kiosk-nav-zone--prev";
    prev.setAttribute("tabindex", "-1");
    prev.setAttribute("aria-label", "Indietro");

    const next = document.createElement("button");
    next.type = "button";
    next.className = "kiosk-nav-zone kiosk-nav-zone--next";
    next.setAttribute("tabindex", "-1");
    next.setAttribute("aria-label", "Avanti");

    wrap.append(prev, next);
    document.body.appendChild(wrap);
    return wrap;
}

function logGpio(message) {
    console.log("[kiosk-gpio] " + message);
    console.info("[kiosk-gpio] " + message);
}

function isKioskPlayerHost() {
    return Boolean(document.getElementById("kiosk-frame")) && !isKioskEmbedded();
}

var pendingGpioDirections = [];
var pendingGpioFlushBusy = false;

function isIframeReady(frame) {
    if (!frame || !frame.contentWindow) {
        return false;
    }
    try {
        var doc = frame.contentWindow.document;
        return Boolean(doc && doc.readyState === "complete");
    } catch (error) {
        return false;
    }
}

function isBrightSignGpioReady() {
    if (!brightSignGpioReady) {
        return false;
    }
    if (isKioskPlayerHost()) {
        return isIframeReady(document.getElementById("kiosk-frame"));
    }
    return true;
}

function acceptBrightSignCommand(actionLabel, run) {
    if (!isBrightSignGpioReady()) {
        logGpio("ignoro " + actionLabel + ": caricamento non completo");
        return false;
    }

    var now = Date.now();
    var elapsed = now - lastBrightSignCommandAt;
    if (lastBrightSignCommandAt && elapsed < GPIO_COMMAND_GAP_MS) {
        logGpio(
            "ignoro " +
                actionLabel +
                ": cooldown " +
                GPIO_COMMAND_GAP_MS +
                "ms (mancano " +
                (GPIO_COMMAND_GAP_MS - elapsed) +
                "ms)"
        );
        return false;
    }

    lastBrightSignCommandAt = now;
    run();
    return true;
}

function whenPageFullyLoaded(callback) {
    if (document.readyState === "complete") {
        window.setTimeout(callback, 0);
        return;
    }
    window.addEventListener("load", callback, { once: true });
}

function markBrightSignGpioReady() {
    if (brightSignGpioReady) {
        return;
    }
    brightSignGpioReady = true;
    logGpio("GPIO ready ctx=" + gpioContextLabel());
}

function handleGpioDirection(direction) {
    if (direction === "pause") {
        toggleKioskPause();
        return;
    }
    handleTapOnPage(direction);
}

function deliverGpioToFrame(direction) {
    var frame = document.getElementById("kiosk-frame");
    if (!frame || !frame.contentWindow || !isIframeReady(frame)) {
        pendingGpioDirections.push(direction);
        logGpio("iframe non pronto, accodo " + direction);
        return false;
    }

    try {
        var childNav = frame.contentWindow.KioskNavigation;
        if (childNav && typeof childNav.handleGpioDirection === "function") {
            logGpio("direct → iframe " + direction);
            childNav.handleGpioDirection(direction);
            return true;
        }
    } catch (error) {
        logGpio("direct call fallita: " + error.message);
    }

    try {
        frame.contentWindow.postMessage(
            { type: "kiosk-gpio", direction: direction },
            window.location.origin
        );
        logGpio("postMessage → iframe " + direction);
        return true;
    } catch (error2) {
        pendingGpioDirections.push(direction);
        logGpio("postMessage fallito, accodo " + direction);
        return false;
    }
}

function flushPendingGpioToFrame() {
    if (pendingGpioFlushBusy || !pendingGpioDirections.length) {
        return;
    }
    if (!isBrightSignGpioReady()) {
        logGpio("flush in attesa: caricamento non completo");
        return;
    }

    pendingGpioFlushBusy = true;

    function next() {
        if (!pendingGpioDirections.length) {
            pendingGpioFlushBusy = false;
            return;
        }
        var direction = pendingGpioDirections.shift();
        deliverGpioToFrame(direction);
        window.setTimeout(next, GPIO_COMMAND_GAP_MS);
    }

    next();
}

function initKioskPlayerHostBridge() {
    if (!isKioskPlayerHost()) {
        return;
    }
    var frame = document.getElementById("kiosk-frame");
    if (!frame || initKioskPlayerHostBridge.done) {
        return;
    }
    initKioskPlayerHostBridge.done = true;
    frame.addEventListener("load", function () {
        logGpio("iframe load");
        window.setTimeout(function () {
            markBrightSignGpioReady();
            flushPendingGpioToFrame();
        }, 50);
    });
}

function forwardGpioToFrame(direction) {
    return deliverGpioToFrame(direction);
}

function handleTap(direction) {
    if (isKioskPlayerHost()) {
        if (direction === "pause") {
            toggleKioskPause();
        }
        logGpio("player host → iframe " + direction);
        forwardGpioToFrame(direction);
        return;
    }

    logGpio("tap " + direction + (isKioskEmbedded() ? " (embed)" : ""));
    handleTapOnPage(direction);
}

function handleTapOnPage(direction) {
    const nav = getKioskNavigation();
    const handler = direction === "prev" ? nav.onTapLeft : nav.onTapRight;
    const fallbackUrl = direction === "prev" ? nav.prevPageUrl : nav.nextPageUrl;

    if (typeof handler === "function" && handler() === true) {
        return;
    }

    const entryDirection = direction === "prev" ? "back" : "forward";
    goToKioskPage(fallbackUrl, entryDirection);
}

function parseGpioPayload(data) {
    if (!data) {
        return null;
    }

    if (typeof data === "string") {
        try {
            return JSON.parse(data);
        } catch (error) {
            return { action: data };
        }
    }

    return typeof data === "object" ? data : null;
}

function gpioActionToDirection(action) {
    const value = String(action || "").trim().toLowerCase();
    if (value === "next" || value === "right" || value === "forward") {
        return "next";
    }
    if (value === "prev" || value === "previous" || value === "back" || value === "left") {
        return "prev";
    }
    return null;
}

function handleGpioPayload(payload) {
    if (!payload) {
        return;
    }

    const direction = gpioActionToDirection(
        payload.action ?? payload.gpio ?? payload.button ?? payload.direction
    );
    if (!direction) {
        return;
    }

    acceptBrightSignCommand(direction, function () {
        handleTap(direction);
    });
}

function isAllowedGpioOrigin(event) {
    const nav = getKioskNavigation();
    const allowed = nav.gpioAllowedOrigins;
    if (!Array.isArray(allowed) || !allowed.length) {
        return true;
    }
    return allowed.includes(event.origin);
}

function handleBrightSignGpioMessage(event) {
    if (!isAllowedGpioOrigin(event)) {
        return;
    }

    handleGpioPayload(parseGpioPayload(event.data));
}

function handleBrightSignBsMessage(event) {
    const payload = parseGpioPayload(event?.data ?? event);
    handleGpioPayload(payload);
}

function gpioContextLabel() {
    if (isKioskPlayerHost()) {
        return "player-host";
    }
    if (isKioskEmbedded()) {
        return "embed";
    }
    return "standalone";
}

function initBrightSignGpioNavigation() {
    logGpio(
        "probe BSMessagePort ctx=" +
            gpioContextLabel() +
            " available=" +
            (typeof BSMessagePort === "function")
    );
    if (initBrightSignGpioNavigation.done) {
        return;
    }
    initBrightSignGpioNavigation.done = true;

    logGpio("init BSMessagePort ctx=" + gpioContextLabel());

    // Fallback per test da browser con window.postMessage(...)
    window.addEventListener("message", handleBrightSignGpioMessage);

    // BrightSign HD224: htmlWidget.PostJSMessage({ action: "next" })
    if (typeof BSMessagePort === "function") {
        try {
            const bsMessage = new BSMessagePort();
            bsMessage.addEventListener("bsmessage", handleBrightSignBsMessage);
        } catch (error) {
            console.warn("BrightSign BSMessagePort non disponibile:", error);
        }
    }
}

function initBrightSignControlPort() {
    logGpio(
        "probe BSControlPort ctx=" +
            gpioContextLabel() +
            " available=" +
            (typeof BSControlPort === "function")
    );
    if (initBrightSignControlPort.done) {
        return;
    }

    if (typeof BSControlPort !== "function") {
        logGpio("BSControlPort non disponibile ctx=" + gpioContextLabel());
        return;
    }

    initBrightSignControlPort.done = true;

    try {
        const gpio = new BSControlPort("BrightSign");
        gpio.ConfigureAsInput(0);
        gpio.ConfigureAsInput(1);
        gpio.ConfigureAsInput(2);

        logGpio(
            "init BSControlPort pin 0=prev 1=pause 2=next ctx=" + gpioContextLabel()
        );

        const pinToDirection = {
            0: "prev",
            2: "next",
        };

        gpio.oncontroldown = function (event) {
            logGpio("pin down code=" + event.code);
            if (event.code === 1) {
                acceptBrightSignCommand("pause", function () {
                    toggleKioskPause();
                    if (isKioskPlayerHost()) {
                        deliverGpioToFrame("pause");
                    }
                });
                return;
            }

            var direction = pinToDirection[event.code];
            if (!direction) {
                return;
            }
            acceptBrightSignCommand(direction, function () {
                handleTap(direction);
            });
        };
    } catch (error) {
        console.warn("BrightSign BSControlPort non disponibile:", error);
    }
}

function isTypingTarget(target) {
    if (!target || !(target instanceof Element)) {
        return false;
    }
    const tag = target.tagName;
    return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
    );
}

function handleKeydown(event) {
    if (isTypingTarget(event.target)) {
        return;
    }

    if (event.key === "ArrowLeft") {
        event.preventDefault();
        handleTap("prev");
        return;
    }

    if (event.key === "ArrowRight") {
        event.preventDefault();
        handleTap("next");
        return;
    }

    if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        if (isKioskPlayerHost()) {
            toggleKioskPause();
            forwardGpioToFrame("pause");
        } else {
            toggleKioskPause();
        }
    }
}

let kioskNavInitialized = false;
let kioskKeyboardInitialized = false;

function initKioskKeyboardNavigation() {
    if (kioskKeyboardInitialized) {
        return;
    }
    kioskKeyboardInitialized = true;
    document.addEventListener("keydown", handleKeydown);
}

function initKioskTapNavigation() {
    if (kioskNavInitialized || isKioskEmbedded()) {
        return;
    }

    const nav = getKioskNavigation();
    const canPrev = canNavigatePrev(nav);
    const canNext = canNavigateNext(nav);
    if (!canPrev && !canNext) {
        return;
    }

    kioskNavInitialized = true;

    const zones = ensureNavZones();
    const prevZone = zones.querySelector(".kiosk-nav-zone--prev");
    const nextZone = zones.querySelector(".kiosk-nav-zone--next");

    prevZone.hidden = !canPrev;
    nextZone.hidden = !canNext;

    prevZone.addEventListener("click", () => handleTap("prev"));
    nextZone.addEventListener("click", () => handleTap("next"));
}

function initEmbeddedGpioRelay() {
    if (!isKioskEmbedded()) {
        return;
    }

    window.addEventListener("message", function (event) {
        if (event.source !== window.parent) {
            return;
        }
        if (event.origin !== window.location.origin) {
            return;
        }

        var data = event.data;
        if (!data || data.type !== "kiosk-gpio") {
            return;
        }

        if (data.direction === "pause") {
            logGpio("relay pause da player");
            toggleKioskPause();
            return;
        }

        logGpio("relay " + data.direction + " da player");
        handleTapOnPage(data.direction);
    });
}

function scheduleKioskNavInit() {
    window.setTimeout(function () {
        applyKioskPausedUi();
        initKioskKeyboardNavigation();
        initKioskTapNavigation();
        initEmbeddedGpioRelay();
        initKioskPlayerHostBridge();
    }, 0);
}

function applyKioskPausedUi() {
    if (!document.body) {
        return;
    }
    document.body.classList.toggle("kiosk-paused", kioskPaused);
}

window.KioskNavigation = Object.assign(window.KioskNavigation || {}, {
    goToPage: goToKioskPage,
    markEntryDirection: markKioskEntryDirection,
    consumeEntryDirection: consumeKioskEntryDirection,
    registerCycleController,
    createPausableTimeout,
    togglePause: toggleKioskPause,
    setPaused: setKioskPaused,
    isPaused: isKioskPaused,
    isEmbedded: isKioskEmbedded,
    publishPageDuration: publishKioskPageDuration,
    handleGpioDirection: handleGpioDirection,
    flushPendingGpio: flushPendingGpioToFrame,
    initHardwareGpio: initKioskHardwareGpio,
});

function initKioskHardwareGpio() {
    initBrightSignGpioNavigation();
    initBrightSignControlPort();
}

function bootBrightSignGpioAfterLoad() {
    initKioskHardwareGpio();

    if (isKioskPlayerHost()) {
        var frame = document.getElementById("kiosk-frame");
        if (frame && isIframeReady(frame)) {
            markBrightSignGpioReady();
            flushPendingGpioToFrame();
        } else {
            logGpio("player host: attendo iframe load prima di accettare GPIO");
        }
        return;
    }

    markBrightSignGpioReady();
}

document.addEventListener("DOMContentLoaded", scheduleKioskNavInit);
whenPageFullyLoaded(bootBrightSignGpioAfterLoad);
