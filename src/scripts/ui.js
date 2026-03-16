// Depends on: app.js globals (db, domain, viewMode, input, list, allTasksBtn, hintText)

// ── CREATE TODO ELEMENT ───────────────────────────────────────
function createTodo(val, done) {
    const todo     = document.createElement("div");
    const content  = document.createElement("div");
    const checkbox = document.createElement("input");
    const label    = document.createElement("span");
    const del      = document.createElement("span");

    todo.className     = "todo" + (done ? " done" : "");
    content.className  = "todo-content";
    checkbox.type      = "checkbox";
    checkbox.className = "todo-checkbox";
    checkbox.checked   = done;
    label.className    = "todo-text";
    label.textContent  = val;
    del.className      = "delete-btn";

    content.append(checkbox, label);
    todo.append(content, del);
    return todo;
}

// ── RENDER LIST ───────────────────────────────────────────────
function renderList(todos, d) {
    todos.forEach(({ val, done }) => {
        const todo = createTodo(val, done);
        if (d) todo.dataset.domain = d;
        list.appendChild(todo);
    });
}

// ── ALL TASKS VIEW ────────────────────────────────────────────
function renderAllTasks() {
    list.innerHTML = "";
    const domains = Object.keys(db).filter(d => db[d]?.length > 0);

    if (domains.length === 0) {
        const empty = document.createElement("div");
        empty.className   = "domain-label";
        empty.textContent = "No tasks anywhere yet";
        list.appendChild(empty);
        return;
    }

    for (const d of domains) {
        const group = document.createElement("div");
        const label = document.createElement("div");
        group.className   = "domain-group";
        label.className   = "domain-label";
        label.textContent = d;
        group.appendChild(label);
        db[d].forEach(({ val, done }) => {
            const todo = createTodo(val, done);
            todo.dataset.domain = d;
            group.appendChild(todo);
        });
        list.appendChild(group);
    }
}

function toggleView() {
    viewMode = viewMode === "site" ? "all" : "site";

    if (viewMode === "all") {
        hintText.textContent = "All sites";
        input.classList.add("hidden");
        allTasksBtn.classList.add("active");
        renderAllTasks();
    } else {
        hintText.textContent = "Tasks for this site only";
        input.classList.remove("hidden");
        allTasksBtn.classList.remove("active");
        list.innerHTML = "";
        renderList(db[domain] ?? []);
        input.focus();
    }
}

// ── CONFLICT BANNER ───────────────────────────────────────────
function showConflictBanner(count) {
    const banner = document.getElementById("conflict_banner");
    banner.textContent = `${count} task${count > 1 ? "s" : ""} updated from another device`;
    banner.classList.remove("hidden");
    setTimeout(() => banner.classList.add("hidden"), 3000);
}
