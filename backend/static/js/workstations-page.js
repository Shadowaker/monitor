const WORKSTATIONS_ROTATE_MS = 30 * 1000;

function getWorkstationsBootstrap() {
    return window.WorkstationsBootstrap || {};
}

function getWorkstationCells() {
    return document.querySelectorAll(".cluster-grid .cell");
}

function resetCells() {
    getWorkstationCells().forEach((element) => {
        element.classList.remove("offline", "maintenance", "occupied");
    });
}

function setOfflineLocation(ids) {
    ids.forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
            element.classList.add("offline");
        }
    });
}

function setUsedLocation(ids) {
    ids.forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
            element.classList.add("occupied");
        }
    });
}

function applyMaintenance(ids) {
    ids.forEach((pcId) => {
        const cell = document.getElementById(pcId);
        if (cell) {
            cell.classList.add("maintenance");
        }
    });
}

function highlightWorkstations() {
    const boot = getWorkstationsBootstrap();
    resetCells();

    if (boot.offlinePCs && boot.offlinePCs.length) {
        setOfflineLocation(boot.offlinePCs);
    }
    if (boot.onlinePCs && boot.onlinePCs.length) {
        setUsedLocation(boot.onlinePCs);
    }
    if (boot.maintenancePCs && boot.maintenancePCs.length) {
        applyMaintenance(boot.maintenancePCs);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    highlightWorkstations();
    const boot = getWorkstationsBootstrap();
    const delay = boot.rotateAfterMs || WORKSTATIONS_ROTATE_MS;

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
