const KIOSK_PAUSED_KEY = "kiosk_paused";
const META_FALLBACK_MS = 2500;

function isKioskPaused() {
    try {
        return sessionStorage.getItem(KIOSK_PAUSED_KEY) === "true";
    } catch (error) {
        return false;
    }
}

function logPlayer(message) {
    console.log("[kiosk-player] " + message);
    console.info("[kiosk-player] " + message);
}

function showPlayerError(message) {
    logPlayer("ERRORE: " + message);
    var frame = document.getElementById("kiosk-frame");
    if (!frame) return;
    frame.removeAttribute("src");
    frame.srcdoc =
        '<body style="margin:0;background:#1e1e2f;color:#fff;font:24px sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;padding:24px;text-align:center">' +
        message +
        "</body>";
}

function formatCycleSummary(cycle) {
    if (!cycle || !cycle.length) {
        return "(vuoto)";
    }
    return cycle
        .map(function (item) {
            var seconds = Math.round((item.duration_ms || 0) / 1000);
            var suffix = item.advance_on_complete ? ", attendi fine" : "";
            return item.id + "(" + seconds + "s" + suffix + ")";
        })
        .join(" → ");
}

function createKioskPlayer() {
    var frame = document.getElementById("kiosk-frame");
    if (!frame) return null;

    var cycle = [];
    var index = 0;
    var timer = null;
    var metaFallbackTimer = null;
    var pausePoll = null;
    var pageDurationMs = null;
    var pageStartedAt = 0;
    var configLoading = false;

    function clearTimer() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    }

    function clearMetaFallback() {
        if (metaFallbackTimer) {
            clearTimeout(metaFallbackTimer);
            metaFallbackTimer = null;
        }
    }

    function currentItem() {
        return cycle[index] || null;
    }

    function waitsForPageComplete() {
        var item = currentItem();
        return item ? Boolean(item.advance_on_complete) : false;
    }

    function pageUrl(item) {
        var url = new URL(item.url, window.location.origin);
        url.searchParams.set("embed", "1");
        return url.toString();
    }

    function refreshCycleConfig() {
        return fetch("/kiosk/config.json", { cache: "no-store" })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("config.json HTTP " + response.status);
                }
                return response.json();
            })
            .then(function (config) {
                var nextCycle = config.cycle || [];
                if (!nextCycle.length) {
                    throw new Error("ciclo kiosk vuoto");
                }
                cycle = nextCycle;
                logPlayer("config aggiornata: " + formatCycleSummary(cycle));
                return cycle;
            });
    }

    function armPageTimer(durationMs) {
        clearTimer();
        pageDurationMs = durationMs;
        pageStartedAt = Date.now();
        if (isKioskPaused()) {
            return;
        }
        timer = window.setTimeout(function () {
            loadIndex(index + 1);
        }, durationMs);
    }

    function scheduleMetaFallback() {
        if (waitsForPageComplete()) {
            return;
        }

        clearMetaFallback();
        metaFallbackTimer = window.setTimeout(function () {
            if (timer || pageDurationMs) {
                return;
            }
            var item = currentItem();
            if (item && item.duration_ms) {
                logPlayer(
                    "timer fallback " + item.id + " → " + item.duration_ms + "ms"
                );
                armPageTimer(item.duration_ms);
            }
        }, META_FALLBACK_MS);
    }

    function resetPageTiming() {
        clearTimer();
        clearMetaFallback();
        pageDurationMs = null;
        pageStartedAt = 0;
    }

    function loadIndex(nextIndex) {
        if (configLoading) {
            return;
        }
        configLoading = true;
        resetPageTiming();

        refreshCycleConfig()
            .then(function () {
                index = ((nextIndex % cycle.length) + cycle.length) % cycle.length;
                var item = currentItem();
                if (!item) {
                    throw new Error("pagina ciclo non trovata");
                }
                var nextUrl = pageUrl(item);
                logPlayer(
                    "carico " +
                        item.id +
                        " (" +
                        (item.duration_ms / 1000) +
                        "s" +
                        (item.advance_on_complete ? ", attendi fine" : "") +
                        ") → " +
                        nextUrl
                );
                frame.src = nextUrl;
                scheduleMetaFallback();
            })
            .catch(function (error) {
                showPlayerError("Config/ciclo non disponibile: " + error.message);
            })
            .then(function () {
                configLoading = false;
            });
    }

    function onFrameLoad() {
        if (window.KioskNavigation && window.KioskNavigation.flushPendingGpio) {
            window.KioskNavigation.flushPendingGpio();
        }
    }

    function step(delta) {
        loadIndex(index + delta);
    }

    function handleMessage(event) {
        if (event.source !== frame.contentWindow) {
            return;
        }

        var data = event.data;
        if (!data || typeof data !== "object") {
            return;
        }

        if (data.type === "kiosk-page-duration" && !waitsForPageComplete()) {
            clearMetaFallback();
            armPageTimer(data.duration_ms);
            return;
        }

        if (data.type === "kiosk-page-complete") {
            logPlayer(
                "pagina completata → " + (data.direction === "back" ? "indietro" : "avanti")
            );
            resetPageTiming();
            if (data.direction === "back") {
                loadIndex(index - 1);
            } else {
                loadIndex(index + 1);
            }
        }
    }

    function resumePageTimerIfNeeded() {
        if (waitsForPageComplete() || timer || !pageDurationMs || !pageStartedAt || isKioskPaused()) {
            return;
        }
        var elapsed = Date.now() - pageStartedAt;
        var remaining = Math.max(0, pageDurationMs - elapsed);
        if (remaining > 0) {
            armPageTimer(remaining);
        } else {
            loadIndex(index + 1);
        }
    }

    function startPausePolling() {
        if (pausePoll) return;
        pausePoll = window.setInterval(function () {
            if (isKioskPaused()) {
                clearTimer();
                return;
            }
            resumePageTimerIfNeeded();
        }, 500);
    }

    function start() {
        frame.addEventListener("load", onFrameLoad);
        window.addEventListener("message", handleMessage);
        startPausePolling();
        logPlayer("leggo configurazione kiosk...");
        loadIndex(0);
    }

    return { start: start, step: step };
}

document.addEventListener("DOMContentLoaded", function () {
    logPlayer("DOM ready");
    var player = createKioskPlayer();
    if (player) {
        player.start();
    } else {
        showPlayerError("iframe #kiosk-frame non trovato");
    }

    if (window.KioskNavigation && window.KioskNavigation.initHardwareGpio) {
        window.KioskNavigation.initHardwareGpio();
    }
    logPlayer(
        "gpio embedded=" +
            (window.KioskNavigation && window.KioskNavigation.isEmbedded
                ? window.KioskNavigation.isEmbedded()
                : "?") +
            " BSControlPort=" +
            (typeof BSControlPort === "function")
    );
});
