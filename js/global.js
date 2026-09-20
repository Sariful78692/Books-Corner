// Global API URL for Google Sheets
const scriptURL = "https://script.google.com/macros/s/AKfycbw3UOQMS9zjhch1ILsrl4YFWERx21pLmkT0wgvWtPNTPQsKOICz8acLFLnEMln5YDEd/exec";

// Save master data to the same Google Sheet backend used by the transactions.
// localStorage remains the offline cache, so the UI still works if the network is down.
function saveMasterData(sheetName, value) {
    if (typeof scriptURL === "undefined" || !scriptURL) return Promise.resolve(false);
    return fetch(scriptURL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetName, rowData: [value] })
    }).then(() => true).catch(() => false);
}

function deleteMasterData(sheetName, value) {
    if (typeof scriptURL === "undefined" || !scriptURL) return Promise.resolve(false);
    return fetch(scriptURL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_master", sheetName: sheetName, value: value }) }).then(() => true).catch(() => false);
}

function syncCloudData() {
    if (typeof scriptURL === 'undefined' || !scriptURL) return Promise.resolve(false);
    return fetch(scriptURL + "?action=sync", { cache: "no-store" })
        .then(response => response.json())
        .then(data => {
            if (!data) return false;
            // Master sheets may be returned using their sheet names.
            if (Array.isArray(data.Publishers)) data.bookPublishers = data.Publishers.map(row => Array.isArray(row) ? row[0] : (row.name || row.publisher || row.value || row));
            if (Array.isArray(data.Classes)) data.schoolClasses = data.Classes.map(row => Array.isArray(row) ? row[0] : (row.name || row.className || row.value || row));
            Object.keys(data).forEach(key => {
                if (!Array.isArray(data[key])) return;

                if (key === "bookPublishers" || key === "schoolClasses") {
                    data[key] = data[key].map(item => {
                        if (typeof item === "string") return item.trim();
                        if (Array.isArray(item)) return String(item[0] || "").trim();
                        return String(item.name || item.publisher || item.className || item.value || "").trim();
                    }).filter(Boolean);
                    const deletedKey = key === "bookPublishers" ? "deletedPublishers" : "deletedClasses";
                    const deleted = JSON.parse(localStorage.getItem(deletedKey) || "[]");
                    data[key] = data[key].filter(item => !deleted.some(name => name.toLowerCase() === item.toLowerCase()));
                }

                // Never discard items created locally when the cloud copy is older.
                // These lists are maintained by the UI and must survive every sync.
                const persistentListKeys = ["bookPublishers", "schoolClasses", "classBooksMapping"];
                if (persistentListKeys.includes(key)) {
                    let local = [];
                    try { local = JSON.parse(localStorage.getItem(key) || "[]"); } catch (_) { local = []; }
                    const merged = [...data[key], ...local];
                    const seen = new Set();
                    const unique = merged.filter(item => {
                        const identity = typeof item === "object"
                            ? JSON.stringify(item)
                            : String(item).trim().toLowerCase();
                        if (seen.has(identity)) return false;
                        seen.add(identity);
                        return true;
                    });
                    localStorage.setItem(key, JSON.stringify(unique));
                } else {
                    localStorage.setItem(key, JSON.stringify(data[key]));
                }
            });
            return true;
        });
}

function getActivePublishers() {
    const entries = JSON.parse(localStorage.getItem("bookEntries")) || [];
    const publishers = entries.map(entry => entry.publisher).filter(Boolean);
    return [...new Map(publishers.map(p => {
        const name = String(p).normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim();
        return [name.toLowerCase(), name];
    }).filter(([key]) => key)).values()];
}

// সাইডবারে পাবলিশার সাবমেনু ডাইনামিকালি লোড করা
function loadSidebarPublishers() {
    const publisherSubMenu = document.getElementById("publisherSubMenu");
    if (!publisherSubMenu) return;

    let savedPublishers = JSON.parse(localStorage.getItem("bookPublishers")) || ["Anupam Prokashani"];
    publisherSubMenu.innerHTML = '<li><a href="publisher/publisher.html" target="contentFrame">All Publishers</a></li>';
    
    savedPublishers.forEach(pub => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = `publisher/publisher.html?pub=${encodeURIComponent(pub)}`;
        a.target = "contentFrame";
        a.textContent = pub;
        li.appendChild(a);
        publisherSubMenu.appendChild(li);
    });
}

document.addEventListener("DOMContentLoaded", function() {
    if (window.top === window.self && sessionStorage.getItem("bookAuthSession") !== "1") {
        window.location.replace("login.html");
        return;
    }
    
    // Load database publishers before building the sidebar menu.
    syncCloudData()
        .catch(error => console.warn("Sidebar publisher sync failed; using saved publishers", error))
        .finally(loadSidebarPublishers);

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", function() {
        sessionStorage.removeItem("bookAuthSession");
        window.location.replace("login.html");
    });

    // পেজ রিলোড হলে ব্রাউজারের অ্যাড্রেস বার থেকে লিংক পড়ে iframe এ লোড করা
    const currentHash = window.location.hash.substring(1);
    if (currentHash) {
        const iframe = document.querySelector('iframe[name="contentFrame"]');
        if (iframe) iframe.src = currentHash;
    }

    // গ্লোবাল ক্লিক ইভেন্ট (Dropdown Accordion এবং Active Link)
    document.addEventListener('click', function(e) {
        
        // --- ১. Dropdown Accordion Logic (একটি খুললে অন্যটি বন্ধ হবে) ---
        if (e.target.closest('.dropdown-toggle')) {
            const clickedToggle = e.target.closest('.dropdown-toggle');
            const parentLi = clickedToggle.closest('.has-dropdown');
            
            // অন্য সব ওপেন থাকা ড্রপডাউন বন্ধ করা
            document.querySelectorAll('.has-dropdown').forEach(li => {
                if (li !== parentLi) {
                    li.classList.remove('open');
                }
            });
            
            // যেটিতে ক্লিক করা হয়েছে সেটিকে টগল (ওপেন/ক্লোজ) করা
            parentLi.classList.toggle('open');
        }
        
        // --- ২. মেনু ক্লিক করলে Active ক্লাস এবং URL Hash পরিবর্তন করা ---
        const link = e.target.closest('#menuList a');
        if (link && !link.classList.contains('dropdown-toggle')) {
            // Close any open submenu when navigating to a normal menu page
            // (including Dashboard).
            document.querySelectorAll('#menuList .has-dropdown').forEach(li => {
                li.classList.remove('open');
            });
            document.querySelectorAll('#menuList a').forEach(item => item.classList.remove('active'));
            link.classList.add('active');
            
            // ব্রাউজারের অ্যাড্রেস বার আপডেট করা
            window.location.hash = link.getAttribute('href');
        }
    });

    // --- ৩. Date ফিল্ডে অটোমেটিক আজকের ডেট বসানো (অন্যান্য পেজের ফর্মের জন্য) ---
    const dateInputs = document.querySelectorAll('input[type="date"]');
    dateInputs.forEach(input => {
        if (!input.value) {
            input.value = new Date().toISOString().split('T')[0];
        }
    });
});
