const SPLASH_ROTATE_MS = 15 * 1000;

function getSplashBootstrap() {
    return window.SplashBootstrap || {};
}

function scheduleKioskRedirect(boot) {
    if (window.KioskNavigation?.isEmbedded?.()) return;
    const delay = boot.rotateAfterMs || SPLASH_ROTATE_MS;
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

document.addEventListener("DOMContentLoaded", () => {
    const boot = getSplashBootstrap();
    const delay = boot.rotateAfterMs || SPLASH_ROTATE_MS;

    if (window.KioskNavigation?.isEmbedded?.()) {
        window.KioskNavigation.publishPageDuration(delay);
        return;
    }

    if (!boot.nextPageUrl) return;
    scheduleKioskRedirect(boot);
});
