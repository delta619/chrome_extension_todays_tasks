// ── LOCAL STORAGE ─────────────────────────────────────────────
const storageGet = key  => new Promise(resolve => chrome.storage.local.get(key, resolve));
const storageSet = data => new Promise(resolve => chrome.storage.local.set(data, resolve));

// ── DRIVE CONFIG ──────────────────────────────────────────────
const DRIVE_FILE      = "tasks.json";
const DRIVE_CACHE_KEY = "__drive_cache__";
let   driveFileId     = null;

// ── DRIVE AUTH ────────────────────────────────────────────────
function driveToken(interactive = false) {
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive }, token => {
            if (chrome.runtime.lastError || !token)
                reject(new Error(chrome.runtime.lastError?.message ?? "no token"));
            else
                resolve(token);
        });
    });
}

// ── DRIVE REQUEST ─────────────────────────────────────────────
async function driveRequest(url, options = {}) {
    const makeRequest = token => fetch(url, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, ...options.headers },
    });

    let token = await driveToken();
    let res   = await makeRequest(token);

    if (res.status === 401) {
        await new Promise(r => chrome.identity.removeCachedAuthToken({ token }, r));
        token = await driveToken();
        res   = await makeRequest(token);
    }

    return res;
}

// ── DRIVE LOAD ────────────────────────────────────────────────
async function driveLoad() {
    if (!driveFileId) {
        const res = await driveRequest(
            `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27${DRIVE_FILE}%27`
        );
        driveFileId = (await res.json()).files?.[0]?.id ?? null;
    }

    if (!driveFileId) return {};

    const res  = await driveRequest(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`);
    const data = await res.json();
    chrome.storage.local.set({ [DRIVE_CACHE_KEY]: data });
    return data;
}

// ── DRIVE SAVE ────────────────────────────────────────────────
async function driveSave(data) {
    const body = JSON.stringify(data);

    if (!driveFileId) {
        const meta = JSON.stringify({ name: DRIVE_FILE, parents: ["appDataFolder"] });
        const form = new FormData();
        form.append("metadata", new Blob([meta], { type: "application/json" }));
        form.append("file",     new Blob([body], { type: "application/json" }));
        const res   = await driveRequest(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
            { method: "POST", body: form }
        );
        driveFileId = (await res.json()).id;
    } else {
        await driveRequest(
            `https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=media`,
            { method: "PATCH", headers: { "Content-Type": "application/json" }, body }
        );
    }
}
