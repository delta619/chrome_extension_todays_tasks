// Depends on: storage.js, sync.js, ui.js

// ── DOM REFS ──────────────────────────────────────────────────
const input       = document.getElementById("new_todo_input");
const list        = document.getElementById("todos_container");
const syncDot     = document.getElementById("sync_indicator");
const allTasksBtn = document.getElementById("all_tasks_btn");
const hintText    = document.getElementById("hint_text");

// ── STATE ─────────────────────────────────────────────────────
let db         = {};
let domain     = "";
let activeArea = "local";   // "local" | "drive"
let viewMode   = "site";    // "site"  | "all"

// ── MUTATIONS ─────────────────────────────────────────────────
function addTodo(val) {
    if (!val) return;
    (db[domain] ??= []).push({ val, done: false, updatedAt: Date.now() });
    list.appendChild(createTodo(val, false));
    input.value = "";
    save();
}

function deleteTodo(val, d = domain) {
    db[d] = db[d].filter(t => t.val !== val);
    save();
}

function toggleTodo(val, isDone, d = domain) {
    const todo = db[d]?.find(t => t.val === val);
    if (todo) { todo.done = isDone; todo.updatedAt = Date.now(); }
    save();
}

function save() {
    if (activeArea === "drive") {
        driveSave(db);
        chrome.storage.local.set({ [DRIVE_CACHE_KEY]: db });
    } else {
        storageSet(db);
    }
}

// ── LOAD ──────────────────────────────────────────────────────
async function loadTodos() {
    // Show cached data immediately — no visible delay
    const [localData, cacheEntry] = await Promise.all([storageGet(null), storageGet(DRIVE_CACHE_KEY)]);
    db = cacheEntry[DRIVE_CACHE_KEY] ?? localData;
    list.innerHTML = "";
    renderList(db[domain] ?? []);

    // Resolve actual area and refresh in background
    activeArea = await resolveArea();
    setSyncState(activeArea === "drive" ? "synced" : "local");

    if (activeArea === "drive") {
        try {
            db = await driveLoad();
            list.innerHTML = "";
            renderList(db[domain] ?? []);
        } catch {
            activeArea = "local";
            setSyncState("local");
            db = localData;
        }
    } else {
        db = localData;
    }
}

// ── EVENT LISTENERS ───────────────────────────────────────────
input.addEventListener("keypress", e => {
    if (e.key === "Enter") addTodo(input.value.trim());
});

list.addEventListener("click", e => {
    const todo = e.target.closest(".todo");
    if (!todo) return;
    const d   = todo.dataset.domain || domain;
    const val = todo.querySelector(".todo-text").textContent;

    if (e.target.classList.contains("delete-btn")) {
        deleteTodo(val, d);
        if (viewMode === "all") {
            const group = todo.closest(".domain-group");
            todo.remove();
            if (!group.querySelector(".todo")) group.remove();
        } else {
            todo.remove();
        }
    }

    if (e.target.classList.contains("todo-checkbox")) {
        todo.classList.toggle("done", e.target.checked);
        toggleTodo(val, e.target.checked, d);
    }
});

syncDot.addEventListener("click", () => {
    if (activeArea === "drive") signOut();
    else if (activeArea === "local") signIn();
});

allTasksBtn.addEventListener("click", toggleView);

window.addEventListener("online",  handleConnectivityChange);
window.addEventListener("offline", handleConnectivityChange);

// ── INIT ──────────────────────────────────────────────────────
async function init() {
    chrome.tabs.query({ active: true }, async ([tab]) => {
        try { domain = new URL(tab.url).hostname; } catch { return; }
        await loadTodos();
        input.focus();
    });
}

init();
