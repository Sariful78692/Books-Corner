// Global API URL for Google Sheets
const scriptURL = "https://script.google.com/macros/s/AKfycbyR2rv5DLseQES4jxpO0FmsvnsooyVNGYs74gColSf8E7Fkj33w9cZlhhQQAuRviMLq/exec";

function syncCloudData() {
    if (typeof scriptURL === 'undefined' || !scriptURL) return Promise.resolve(false);
    return fetch(scriptURL + "?action=sync", { cache: "no-store" })
        .then(response => response.json())
        .then(data => {
            if (!data) return false;
            Object.keys(data).forEach(key => {
                if (Array.isArray(data[key])) localStorage.setItem(key, JSON.stringify(data[key]));
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
    
    loadSidebarPublishers();

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
