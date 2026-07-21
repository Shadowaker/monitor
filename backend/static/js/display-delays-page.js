(function () {
    var list = document.getElementById("cycle-order-list");
    var addSelect = document.getElementById("cycle-add-select");
    var addBtn = document.getElementById("cycle-add-btn");
    var template = document.getElementById("cycle-row-template");
    var catalog = window.DisplayDelaysPageCatalog || {};

    if (!list || !template) {
        return;
    }

    function currentIds() {
        return Array.prototype.map.call(
            list.querySelectorAll(".cycle-order-item"),
            function (row) {
                return row.getAttribute("data-page-id");
            }
        ).filter(Boolean);
    }

    function refreshIndices() {
        var rows = list.querySelectorAll(".cycle-order-item");
        Array.prototype.forEach.call(rows, function (row, index) {
            var badge = row.querySelector(".cycle-order-item__index");
            if (badge) {
                badge.textContent = String(index + 1);
            }
        });
    }

    function rebuildAddSelect() {
        if (!addSelect) {
            return;
        }

        var active = {};
        currentIds().forEach(function (id) {
            active[id] = true;
        });

        var available = Object.keys(catalog).filter(function (id) {
            return !active[id];
        });

        addSelect.innerHTML = "";
        var placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = available.length
            ? "— Scegli pagina da aggiungere —"
            : "— Tutte le pagine sono già nel ciclo —";
        addSelect.appendChild(placeholder);

        available.forEach(function (id) {
            var option = document.createElement("option");
            option.value = id;
            option.textContent = catalog[id].label;
            addSelect.appendChild(option);
        });

        if (addBtn) {
            addBtn.disabled = available.length === 0;
        }
    }

    function bindRow(row) {
        var up = row.querySelector(".cycle-btn-up");
        var down = row.querySelector(".cycle-btn-down");
        var remove = row.querySelector(".cycle-btn-remove");

        if (up) {
            up.addEventListener("click", function () {
                var prev = row.previousElementSibling;
                if (prev) {
                    list.insertBefore(row, prev);
                    refreshIndices();
                }
            });
        }

        if (down) {
            down.addEventListener("click", function () {
                var next = row.nextElementSibling;
                if (next) {
                    list.insertBefore(next, row);
                    refreshIndices();
                }
            });
        }

        if (remove) {
            remove.addEventListener("click", function () {
                if (currentIds().length <= 1) {
                    return;
                }
                row.remove();
                refreshIndices();
                rebuildAddSelect();
            });
        }
    }

    function createRow(pageId) {
        var meta = catalog[pageId];
        if (!meta) {
            return null;
        }

        var row = template.content.querySelector(".cycle-order-item").cloneNode(true);
        row.setAttribute("data-page-id", pageId);

        var label = row.querySelector(".cycle-order-item__label");
        var duration = row.querySelector(".cycle-order-item__duration");
        var hidden = row.querySelector('input[name="cycle_order"]');

        if (label) {
            label.textContent = meta.label;
        }
        if (duration) {
            duration.textContent = meta.duration;
        }
        if (hidden) {
            hidden.value = pageId;
        }

        bindRow(row);
        return row;
    }

    Array.prototype.forEach.call(
        list.querySelectorAll(".cycle-order-item"),
        bindRow
    );

    if (addBtn && addSelect) {
        addBtn.addEventListener("click", function () {
            var pageId = addSelect.value;
            if (!pageId || currentIds().indexOf(pageId) !== -1) {
                return;
            }

            var row = createRow(pageId);
            if (!row) {
                return;
            }

            list.appendChild(row);
            refreshIndices();
            rebuildAddSelect();
        });
    }

    refreshIndices();
    rebuildAddSelect();
})();
