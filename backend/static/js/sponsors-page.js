const SPONSOR_SLIDE_MS = 3500;
const VISIBLE_RANGE = 2;
const LOGO_TARGET_FILL = 0.97;
const LOGO_MAX_BOOST = 5;

function getSponsorsBootstrap() {
    return window.SponsorsBootstrap || {};
}

function prepareInfiniteTrack(track) {
    const originals = [...track.children];
    const count = originals.length;
    if (!count) {
        return { slides: [], count: 0, startIndex: 0 };
    }

    const before = document.createDocumentFragment();
    const after = document.createDocumentFragment();

    originals.forEach((slide) => {
        const lead = slide.cloneNode(true);
        lead.classList.remove("is-active");
        lead.setAttribute("aria-hidden", "true");
        before.appendChild(lead);

        const tail = slide.cloneNode(true);
        tail.classList.remove("is-active");
        tail.setAttribute("aria-hidden", "true");
        after.appendChild(tail);
    });

    track.insertBefore(before, track.firstChild);
    track.appendChild(after);

    return {
        slides: [...track.children],
        count,
        startIndex: count,
    };
}

function getCoverflowMetrics() {
    const width = window.innerWidth;
    if (width >= 1600) {
        return { spread: 430, depth: 150, rotate: 38 };
    }
    if (width >= 1200) {
        return { spread: 385, depth: 130, rotate: 35 };
    }
    return { spread: 335, depth: 110, rotate: 32 };
}

function buildPagination(container, count) {
    if (!container || !count) return;
    container.innerHTML = "";
    for (let index = 0; index < count; index += 1) {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "sponsors-pagination__dot";
        dot.setAttribute("aria-label", `Sponsor ${index + 1}`);
        dot.dataset.index = String(index);
        container.appendChild(dot);
    }
}

function boostLogo(img) {
    const inner = img.closest(".sponsors-slide__inner");
    if (!inner || !img.naturalWidth || !img.naturalHeight) return;

    const cw = inner.clientWidth;
    const ch = inner.clientHeight;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!cw || !ch) return;

    const containScale = Math.min(cw / nw, ch / nh);
    const renderedW = nw * containScale;
    const renderedH = nh * containScale;
    const fill = Math.max(renderedW / cw, renderedH / ch);
    const boost = fill < LOGO_TARGET_FILL
        ? Math.min(LOGO_TARGET_FILL / fill, LOGO_MAX_BOOST)
        : 1;

    img.style.setProperty("--logo-boost", boost.toFixed(3));
}

function boostAllLogos(root) {
    root.querySelectorAll(".sponsors-slide__inner img").forEach((img) => {
        if (img.complete && img.naturalWidth) {
            boostLogo(img);
            return;
        }
        img.addEventListener("load", () => boostLogo(img), { once: true });
    });
}

function createSponsorsCarousel() {
    const track = document.getElementById("sponsors-track");
    const pagination = document.getElementById("sponsors-pagination");
    if (!track) return null;

    const meta = prepareInfiniteTrack(track);
    const { slides, count, startIndex } = meta;
    if (!slides.length) return null;

    buildPagination(pagination, count);

    let activeIndex = startIndex;
    let slideTimer = null;
    let resizeTimer = null;
    let normalizeTimer = null;

    function getLogicalIndex() {
        return ((activeIndex % count) + count) % count;
    }

    function getSlideDurationMs() {
        const boot = getSponsorsBootstrap();
        return boot.slideDurationMs || SPONSOR_SLIDE_MS;
    }

    function applySlideTransform(slide, offset, animate) {
        slide.classList.toggle("sponsors-slide--instant", !animate);

        const metrics = getCoverflowMetrics();
        const distance = Math.abs(offset);

        if (distance > VISIBLE_RANGE) {
            slide.style.opacity = "0";
            slide.style.pointerEvents = "none";
            slide.style.zIndex = "0";
            slide.style.transform =
                "translate3d(0, 0, -500px) rotateY(0deg) scale(0.45)";
            slide.classList.remove("is-active");
            return;
        }

        const rotateY = offset * -metrics.rotate;
        const scale = 1 - distance * 0.16;
        const translateX = offset * metrics.spread;
        const translateZ = -distance * metrics.depth;
        const opacity = offset === 0 ? 1 : 0.78 - distance * 0.14;

        slide.style.opacity = String(Math.max(opacity, 0));
        slide.style.pointerEvents = offset === 0 ? "auto" : "none";
        slide.style.zIndex = String(10 - distance);
        slide.style.transform =
            `translate3d(${translateX}px, 0, ${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`;
        slide.classList.toggle("is-active", offset === 0);
    }

    function updatePagination() {
        if (!pagination) return;
        const logicalIndex = getLogicalIndex();
        pagination.querySelectorAll(".sponsors-pagination__dot").forEach((dot, index) => {
            dot.classList.toggle("is-active", index === logicalIndex);
        });
    }

    function applyPosition(animate) {
        slides.forEach((slide, index) => {
            applySlideTransform(slide, index - activeIndex, animate);
        });
        updatePagination();
    }

    function normalizeIndex() {
        if (activeIndex >= count * 2) {
            activeIndex -= count;
            applyPosition(false);
        } else if (activeIndex < count) {
            activeIndex += count;
            applyPosition(false);
        }
    }

    function goTo(index, { animate = true } = {}) {
        activeIndex = index;
        applyPosition(animate);
        if (animate) {
            clearTimeout(normalizeTimer);
            normalizeTimer = window.setTimeout(normalizeIndex, 820);
        }
    }

    function stopSlideTimer() {
        if (slideTimer) {
            clearInterval(slideTimer);
            slideTimer = null;
        }
    }

    function resetSlideTimer() {
        stopSlideTimer();
        if (count <= 0) return;
        slideTimer = window.setInterval(() => step(1), getSlideDurationMs());
    }

    function redirectToNextPage() {
        const boot = getSponsorsBootstrap();
        if (!boot.nextPageUrl) return;
        window.KioskNavigation?.goToPage?.(boot.nextPageUrl, "forward")
            ?? (window.location.href = boot.nextPageUrl);
    }

    function redirectToPrevPage() {
        const boot = getSponsorsBootstrap();
        if (!boot.prevPageUrl) return;
        window.KioskNavigation?.goToPage?.(boot.prevPageUrl, "back")
            ?? (window.location.href = boot.prevPageUrl);
    }

    function step(delta) {
        const logical = getLogicalIndex();

        if (delta < 0 && logical <= 0) {
            stopSlideTimer();
            redirectToPrevPage();
            return;
        }

        if (delta > 0 && logical >= count - 1) {
            stopSlideTimer();
            redirectToNextPage();
            return;
        }

        goTo(activeIndex + delta, { animate: true });
        resetSlideTimer();
    }

    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
            boostAllLogos(track);
            applyPosition(false);
        }, 100);
    });

    function pauseCycle() {
        stopSlideTimer();
    }

    function resumeCycle() {
        const logical = getLogicalIndex();
        if (logical >= 0 && logical < count) {
            resetSlideTimer();
        }
    }

    function start() {
        boostAllLogos(track);
        applyPosition(false);
        requestAnimationFrame(() => {
            boostAllLogos(track);
            applyPosition(false);
            resetSlideTimer();
            window.KioskNavigation?.registerCycleController?.({
                pause: pauseCycle,
                resume: resumeCycle,
            });
        });
    }

    return { start, step, pause: pauseCycle, resume: resumeCycle };
}

document.addEventListener("DOMContentLoaded", () => {
    const carousel = createSponsorsCarousel();
    carousel?.start();

    window.KioskNavigation = window.KioskNavigation || {};
    window.KioskNavigation.onTapLeft = () => {
        carousel?.step(-1);
        return true;
    };
    window.KioskNavigation.onTapRight = () => {
        carousel?.step(1);
        return true;
    };
});
