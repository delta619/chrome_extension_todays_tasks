const input       = document.getElementById("new_todo_input");
const list        = document.getElementById("todos_container");
const syncDot     = document.getElementById("sync_indicator");
const allTasksBtn = document.getElementById("all_tasks_btn");
const hintText    = document.getElementById("hint_text");

let db         = {};
let domain     = "";
let activeArea = "local";
let viewMode   = "site";

// ── LOCAL STORAGE HELPERS ──────────────────────────────────────
function storageGet(key) {
    return new Promise(resolve => chrome.storage.local.get(key, resolve));
}
function storageSet(data) {
    return new Promise(resolve => chrome.storage.local.set(data, resolve));
}

// ── DRIVE API ─────────────────────────────────────────────────
const DRIVE_FILE      = "tasks.json";
const DRIVE_CACHE_KEY = "__drive_cache__";
let driveFileId       = null;

function driveToken(interactive = false) {
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive }, token => {
            if (chrome.runtime.lastError || !token)
                reject(new Error(chrome.runtime.lastError?.message ?? "no token"));
            else resolve(token);
        });
    });
}

async function driveRequest(url, options = {}) {
    let token = await driveToken();
    let r = await fetch(url, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, ...options.headers },
    });
    if (r.status === 401) {
        await new Promise(res => chrome.identity.removeCachedAuthToken({ token }, res));
        token = await driveToken();
        r = await fetch(url, {
            ...options,
            headers: { Authorization: `Bearer ${token}`, ...options.headers },
        });
    }
    return r;
}

async function driveLoad() {
    if (!driveFileId) {
        const r = await driveRequest(
            `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27${DRIVE_FILE}%27`
        );
        driveFileId = (await r.json()).files?.[0]?.id ?? null;
    }
    if (!driveFileId) return {};
    const r = await driveRequest(
        `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`
    );
    const data = await r.json();
    chrome.storage.local.set({ [DRIVE_CACHE_KEY]: data });
    return data;
}

async function driveSave(data) {
    const body = JSON.stringify(data);
    if (!driveFileId) {
        const meta = JSON.stringify({ name: DRIVE_FILE, parents: ["appDataFolder"] });
        const form = new FormData();
        form.append("metadata", new Blob([meta], { type: "application/json" }));
        form.append("file",     new Blob([body], { type: "application/json" }));
        const r = await driveRequest(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
            { method: "POST", body: form }
        );
        driveFileId = (await r.json()).id;
    } else {
        await driveRequest(
            `https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=media`,
            { method: "PATCH", headers: { "Content-Type": "application/json" }, body }
        );
    }
}

// ── SYNC INDICATOR ────────────────────────────────────────────
function setSyncState(state) {
    syncDot.className = `sync-dot sync-dot--${state}`;
    syncDot.title = {
        synced:  "Synced · Click to sign out",
        merging: "Syncing to Google Drive…",
    }[state] ?? "";
}

// ── STORAGE RESOLVER ──────────────────────────────────────────
async function resolveArea() {
    if (!navigator.onLine) return "local";
    try {
        await driveToken(false);
        return "drive";
    } catch {
        return "local";
    }
}

// ── MERGE: local → drive ──────────────────────────────────────
async function mergeLocalIntoDrive() {
    const [driveData, localData] = await Promise.all([
        driveLoad(),
        storageGet(null),
    ]);
    const driveTodos = driveData[domain] ?? [];
    const localTodos = localData[domain] ?? [];
    const index = new Map(driveTodos.map(t => [t.val, t]));
    let conflicts = 0;
    for (const t of localTodos) {
        const remote = index.get(t.val);
        if (!remote) {
            index.set(t.val, t);
        } else if (remote.done !== t.done) {
            // conflict: same task, different done state — newer timestamp wins
            const remoteTime = remote.updatedAt ?? 0;
            const localTime  = t.updatedAt ?? 0;
            if (localTime > remoteTime) { index.set(t.val, t); }
            conflicts++;
        }
    }
    const merged = Array.from(index.values());
    driveData[domain] = merged;
    await driveSave(driveData);
    chrome.storage.local.remove(domain);
    return { merged, conflicts };
}

// ── TODO DOM ──────────────────────────────────────────────────
function createTodo(val, done) {
    const todo = document.createElement("div");
    todo.className = "todo" + (done ? " done" : "");

    const content = document.createElement("div");
    content.className = "todo-content";

    const checkbox = document.createElement("input");
    checkbox.type      = "checkbox";
    checkbox.className = "todo-checkbox";
    checkbox.checked   = done;

    const label = document.createElement("span");
    label.className   = "todo-text";
    label.textContent = val;

    const deleteBtn = document.createElement("span");
    deleteBtn.className = "delete-btn";

    content.append(checkbox, label);
    todo.append(content, deleteBtn);
    return todo;
}

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
    // Render immediately from cache so there's no visible delay
    const [localData, cacheEntry] = await Promise.all([
        storageGet(null),
        storageGet(DRIVE_CACHE_KEY),
    ]);
    const cached = cacheEntry[DRIVE_CACHE_KEY] ?? localData;
    db = cached;
    list.innerHTML = "";
    (db[domain] ?? []).forEach(({ val, done }) => list.appendChild(createTodo(val, done)));

    // Resolve actual storage area and refresh from Drive in background
    activeArea = await resolveArea();
    setSyncState(activeArea === "drive" ? "synced" : "local");

    if (activeArea === "drive") {
        try {
            db = await driveLoad();
            list.innerHTML = "";
            (db[domain] ?? []).forEach(({ val, done }) => list.appendChild(createTodo(val, done)));
        } catch {
            activeArea = "local";
            setSyncState("local");
            db = localData;
        }
    } else {
        db = localData;
    }
}

// ── ALL TASKS VIEW ────────────────────────────────────────────
function renderAllTasks() {
    list.innerHTML = "";
    const domains = Object.keys(db).filter(d => db[d]?.length > 0);
    if (domains.length === 0) {
        const empty = document.createElement("div");
        empty.className = "domain-label";
        empty.textContent = "No tasks anywhere yet";
        list.appendChild(empty);
        return;
    }
    for (const d of domains) {
        const group = document.createElement("div");
        group.className = "domain-group";
        const label = document.createElement("div");
        label.className = "domain-label";
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
        (db[domain] ?? []).forEach(({ val, done }) => list.appendChild(createTodo(val, done)));
        input.focus();
    }
}

allTasksBtn.addEventListener("click", toggleView);

// ── CONFLICT BANNER ───────────────────────────────────────────
function showConflictBanner(count) {
    const banner = document.getElementById("conflict_banner");
    banner.textContent = `${count} task${count > 1 ? "s" : ""} updated from another device`;
    banner.classList.remove("hidden");
    setTimeout(() => banner.classList.add("hidden"), 3000);
}

// ── CONNECTIVITY ──────────────────────────────────────────────
async function handleConnectivityChange() {
    const newArea = await resolveArea();

    if (newArea === "drive" && activeArea === "local") {
        setSyncState("merging");
        const { merged, conflicts } = await mergeLocalIntoDrive();
        db = { ...db, [domain]: merged };
        activeArea = "drive";
        list.innerHTML = "";
        merged.forEach(({ val, done }) => list.appendChild(createTodo(val, done)));
        setSyncState("synced");
        if (conflicts > 0) showConflictBanner(conflicts);
    } else if (newArea !== activeArea) {
        activeArea = newArea;
        setSyncState(newArea === "drive" ? "synced" : "local");
    }
}

window.addEventListener("online",  handleConnectivityChange);
window.addEventListener("offline", handleConnectivityChange);

// ── SYNC DOT: sign-in (local) / sign-out (synced) ─────────────
syncDot.addEventListener("click", async () => {
    if (activeArea === "drive") {
        const token = await driveToken(false).catch(() => null);
        if (token) {
            await new Promise(res => chrome.identity.removeCachedAuthToken({ token }, res));
            await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
        }
        activeArea = "local";
        db = await storageGet(null);
        list.innerHTML = "";
        (db[domain] ?? []).forEach(({ val, done }) => list.appendChild(createTodo(val, done)));
        setSyncState("local");
    } else if (activeArea === "local") {
        setSyncState("merging");
        chrome.identity.getAuthToken({ interactive: true }, async (token) => {
            if (chrome.runtime.lastError || !token) {
                console.error("Auth error:", chrome.runtime.lastError?.message);
                setSyncState("local");
                return;
            }
            await handleConnectivityChange();
        });
    }
});

// ── EVENTS ────────────────────────────────────────────────────
input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") addTodo(input.value.trim());
});

list.addEventListener("click", (e) => {
    if (e.target.classList.contains("delete-btn")) {
        const todo = e.target.closest(".todo");
        const d = todo.dataset.domain || domain;
        deleteTodo(todo.querySelector(".todo-text").textContent, d);
        if (viewMode === "all") {
            const group = todo.closest(".domain-group");
            todo.remove();
            if (!group.querySelector(".todo")) group.remove();
        } else {
            todo.remove();
        }
    }
    if (e.target.classList.contains("todo-checkbox")) {
        const todo = e.target.closest(".todo");
        const isDone = e.target.checked;
        const d = todo.dataset.domain || domain;
        todo.classList.toggle("done", isDone);
        toggleTodo(todo.querySelector(".todo-text").textContent, isDone, d);
    }
});

// ── INIT ──────────────────────────────────────────────────────
async function init() {
    chrome.tabs.query({ active: true }, async ([tab]) => {
        try { domain = new URL(tab.url).hostname; } catch { return; }
        await loadTodos();
        input.focus();
    });
}

init();
