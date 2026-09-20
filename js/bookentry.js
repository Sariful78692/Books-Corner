document.addEventListener("DOMContentLoaded", function() {
    
    // ==========================================
    // ১. Publisher Management 
    // ==========================================
    const publisherSelect = document.getElementById("publisherName");
    const addPublisherBtn = document.getElementById("addPublisherBtn");
    const editPublisherBtn = document.getElementById("editPublisherBtn");
    const deletePublisherBtn = document.getElementById("deletePublisherBtn");

    function loadPublishers() {
        if (!publisherSelect) return;
        
        let savedPublishers = JSON.parse(localStorage.getItem("bookPublishers")) || ["Anupam Prokashani"];
        savedPublishers = savedPublishers.map(pub => typeof pub === "string" ? pub : (pub.name || pub.publisher || pub.value || "")).filter(Boolean);
        localStorage.setItem("bookPublishers", JSON.stringify(savedPublishers));
        publisherSelect.innerHTML = '<option value="">Select Publisher</option>';
        savedPublishers.forEach(pub => {
            const option = document.createElement("option");
            option.value = pub;
            option.textContent = pub;
            publisherSelect.appendChild(option);
        });

        if (window.parent && window.parent.loadSidebarPublishers) {
            window.parent.loadSidebarPublishers();
        }
    }
    // Always refresh the publisher list from the database first, then render it.
    // localStorage remains available as an offline fallback inside syncCloudData.
    syncCloudData()
        .catch(error => console.warn("Publisher sync failed; using saved publishers", error))
        .finally(loadPublishers);

    if (addPublisherBtn) {
        addPublisherBtn.addEventListener("click", function() {
            const newPublisher = prompt("Enter New Publisher Name:");
            if (newPublisher && newPublisher.trim() !== "") {
                let savedPublishers = JSON.parse(localStorage.getItem("bookPublishers")) || [];
                savedPublishers = savedPublishers.map(pub => typeof pub === "string" ? pub : (pub.name || pub.publisher || pub.value || "")).filter(Boolean);
                if (!savedPublishers.includes(newPublisher.trim())) {
                    savedPublishers.push(newPublisher.trim());
                    let deleted = JSON.parse(localStorage.getItem("deletedPublishers") || "[]");
                    deleted = deleted.filter(name => name.toLowerCase() !== newPublisher.trim().toLowerCase());
                    localStorage.setItem("deletedPublishers", JSON.stringify(deleted));
                    localStorage.setItem("bookPublishers", JSON.stringify(savedPublishers));
                    saveMasterData("Publishers", newPublisher.trim());
                    loadPublishers(); 
                    publisherSelect.value = newPublisher.trim(); 
                    alert("Publisher Added!");
                } else {
                    alert("This Publisher already exists!");
                }
            }
        });
    }

    if (editPublisherBtn) {
        editPublisherBtn.addEventListener("click", function() {
            const selectedPub = publisherSelect.value;
            if (!selectedPub) return alert("Please select a publisher to edit.");

            const newName = prompt("Edit Publisher Name:", selectedPub);
            if (newName && newName.trim() !== "" && newName !== selectedPub) {
                let savedPublishers = JSON.parse(localStorage.getItem("bookPublishers")) || [];
                const index = savedPublishers.indexOf(selectedPub);
                if (index > -1) {
                    savedPublishers[index] = newName.trim();
                    localStorage.setItem("bookPublishers", JSON.stringify(savedPublishers));
                    deleteMasterData("Publishers", selectedPub).then(() => saveMasterData("Publishers", newName.trim()));
                    loadPublishers();
                    publisherSelect.value = newName.trim();
                    alert("Publisher Updated!");
                }
            }
        });
    }

    if (deletePublisherBtn) {
        deletePublisherBtn.addEventListener("click", function() {
            const selectedPub = publisherSelect.value;
            if (!selectedPub) return alert("Please select a publisher to delete.");

            if (confirm(`Are you sure you want to delete '${selectedPub}'?`)) {
                let savedPublishers = JSON.parse(localStorage.getItem("bookPublishers")) || [];
                savedPublishers = savedPublishers.filter(pub => pub !== selectedPub);
                localStorage.setItem("bookPublishers", JSON.stringify(savedPublishers));
                let deleted = JSON.parse(localStorage.getItem("deletedPublishers") || "[]");
                if (!deleted.some(name => name.toLowerCase() === selectedPub.toLowerCase())) deleted.push(selectedPub);
                localStorage.setItem("deletedPublishers", JSON.stringify(deleted));
                deleteMasterData("Publishers", selectedPub);
                loadPublishers();
                alert("Publisher Deleted!");
            }
        });
    }

    // ==========================================
    // ২. Book Entry Submit Logic
    // ==========================================
    const bookEntryForm = document.getElementById("bookentryForm");

    if (bookEntryForm) {
        bookEntryForm.addEventListener("submit", function(e) {
            e.preventDefault(); 
            
            const submitBtn = bookEntryForm.querySelector("button[type='submit']");
            const originalBtnText = submitBtn.textContent;
            
            // বাটন ডিজেবল এবং লোডিং টেক্সট
            submitBtn.textContent = "Saving...";
            submitBtn.disabled = true;

            // ⚠️ FIX: pubName এখানে সঠিকভাবে ডিক্লেয়ার করা হলো
            const pubName = publisherSelect ? publisherSelect.value : "";
            
            if(!pubName) {
                alert("Please select a publisher first!");
                submitBtn.textContent = originalBtnText;
                submitBtn.disabled = false;
                return;
            }

            // ফিল্ডগুলো সঠিকভাবে ধরে নেওয়া হচ্ছে
            const orderDateEl = document.getElementById("orderDate");
            const bookNameEl = document.getElementById("bookName");
            const writerNameEl = document.getElementById("writerName");
            const partEl = document.getElementById("part");
            const bookPriceEl = document.getElementById("bookPrice");

            if(!bookNameEl || !bookPriceEl || !orderDateEl) {
                alert("Error: Some required fields are missing in HTML.");
                submitBtn.textContent = originalBtnText;
                submitBtn.disabled = false;
                return;
            }

            // ডেটাবেসের জন্য রিকোয়েস্ট (Price সহ)
            const requestData = {
                sheetName: "BookEntry", 
                rowData: [
                    orderDateEl.value,
                    pubName,
                    bookNameEl.value,
                    writerNameEl.value || "-",
                    partEl.value || "-",
                    bookPriceEl.value
                ]
            };

            // লোকাল স্টোরেজের জন্য ডেটা
            const entryRecord = {
                date: orderDateEl.value,
                publisher: pubName,
                bookName: bookNameEl.value,
                writer: writerNameEl.value || "-",
                part: partEl.value || "-",
                price: bookPriceEl.value
            };
            
            let savedEntries = JSON.parse(localStorage.getItem("bookEntries")) || [];
            savedEntries.push(entryRecord);
            localStorage.setItem("bookEntries", JSON.stringify(savedEntries));

            if(typeof scriptURL !== 'undefined') {
                fetch(scriptURL, {
                    method: 'POST',
                    mode: 'no-cors', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestData)
                })
                .then(() => {
                    alert("Book Entry Saved Successfully!");
                    bookEntryForm.reset(); 
                    
                    // রিসেট করার পর আজকের ডেট এবং সিলেক্ট করা পাবলিশার আবার বসিয়ে দেওয়া
                    orderDateEl.value = new Date().toISOString().split('T')[0];
                    if (publisherSelect) publisherSelect.value = pubName; 
                    
                    submitBtn.textContent = originalBtnText;
                    submitBtn.disabled = false;
                })
                .catch(error => {
                    alert("Network error or script URL issue.");
                    submitBtn.textContent = originalBtnText;
                    submitBtn.disabled = false;
                });
            } else {
                alert("Error: scriptURL is missing! Global.js is not loaded.");
                submitBtn.textContent = originalBtnText;
                submitBtn.disabled = false;
            }
        });
    }
});
