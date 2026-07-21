const PICTURES_ROTATE_MS = 30 * 1000;

function getPicturesBootstrap() {
    return window.PicturesBootstrap || {};
}

function waitForImage(img) {
    if (img.complete && img.naturalWidth > 0) {
        return Promise.resolve(img);
    }

    return new Promise((resolve, reject) => {
        const onLoad = () => {
            cleanup();
            resolve(img);
        };
        const onError = () => {
            cleanup();
            reject(new Error(img.currentSrc || img.src));
        };
        const cleanup = () => {
            img.removeEventListener("load", onLoad);
            img.removeEventListener("error", onError);
        };

        img.addEventListener("load", onLoad);
        img.addEventListener("error", onError);
    });
}

function scheduleKioskRotation(boot) {
    const delay = boot.rotateAfterMs || PICTURES_ROTATE_MS;

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
}

document.addEventListener("DOMContentLoaded", async () => {
    const boot = getPicturesBootstrap();
    const grid = document.querySelector(".pictures-grid");
    if (!grid) return;

    const imgs = [...grid.querySelectorAll("img")];
    const results = await Promise.allSettled(imgs.map(waitForImage));
    const loaded = results.filter((result) => result.status === "fulfilled").length;

    if (loaded > 0) {
        grid.classList.remove("pictures-grid--loading");
        grid.removeAttribute("aria-busy");
    }

    scheduleKioskRotation(boot);
});
