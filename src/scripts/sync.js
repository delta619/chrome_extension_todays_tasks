// Depends on: storage.js (driveToken, driveLoad, driveSave, storageGet)
// Depends on: app.js globals (db, domain, activeArea)

// ── SYNC STATE ────────────────────────────────────────────────
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
    const [driveData, localData] = await Promise.all([driveLoad(), storageGet(null)]);

    const driveTodos = driveData[domain] ?? [];
    const localTodos = localData[domain] ?? [];
    const index      = new Map(driveTodos.map(t => [t.val, t]));
    let   conflicts  = 0;

    for (const t of localTodos) {
        const remote = index.get(t.val);
        if (!remote) {
            index.set(t.val, t);
        } else if (remote.done !== t.done) {
            // same task, different done state — newer timestamp wins
            if ((t.updatedAt ?? 0) > (remote.updatedAt ?? 0)) index.set(t.val, t);
            conflicts++;
        }
    }

    const merged = Array.from(index.values());
    driveData[domain] = merged;
    await driveSave(driveData);
    chrome.storage.local.remove(domain);
    return { merged, conflicts };
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
        renderList(merged);
        setSyncState("synced");
        if (conflicts > 0) showConflictBanner(conflicts);
    } else if (newArea !== activeArea) {
        activeArea = newArea;
        setSyncState(newArea === "drive" ? "synced" : "local");
    }
}

// ── SIGN IN / OUT ─────────────────────────────────────────────
async function signOut() {
    const token = await driveToken(false).catch(() => null);
    if (token) {
        await new Promise(res => chrome.identity.removeCachedAuthToken({ token }, res));
        await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
    }
    activeArea = "local";
    db = await storageGet(null);
    list.innerHTML = "";
    renderList(db[domain] ?? []);
    setSyncState("local");
}

function signIn() {
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
