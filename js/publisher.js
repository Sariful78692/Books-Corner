document.addEventListener("DOMContentLoaded", function() {
    
    const tableBody = document.getElementById("publisherTableBody");
    const pageTitle = document.getElementById("pageTitle");
    const sectionTitle = document.getElementById("sectionTitle");
    const listView = document.getElementById("listView");
    const editView = document.getElementById("editView");
    const editBookForm = document.getElementById("editBookForm");
    const editPublisherSelect = document.getElementById("editPublisher");
    
    const urlParams = new URLSearchParams(window.location.search);
    const selectedPub = urlParams.get('pub');

    function loadEditPublishers() {
        if (!editPublisherSelect) return;
        let savedPublishers = getActivePublishers();
        editPublisherSelect.innerHTML = '<option value="">-- Choose Publisher --</option>';
        savedPublishers.forEach(pub => { editPublisherSelect.innerHTML += `<option value="${pub}">${pub}</option>`; });
    }

    function loadPublisherBooks() {
        let savedEntries = JSON.parse(localStorage.getItem("bookEntries")) || [];
        let filteredEntries = savedEntries;

        if (selectedPub) {
            pageTitle.textContent = `${selectedPub} - Book List`;
            sectionTitle.textContent = `Available Books under ${selectedPub}`;
            filteredEntries = savedEntries.filter(entry => entry.publisher === selectedPub);
        } else {
            pageTitle.textContent = "All Publishers Book List";
            sectionTitle.textContent = "All Registered Books";
        }

        if (!tableBody) return;
        tableBody.innerHTML = ""; 
        
        if (filteredEntries.length === 0) {
            tableBody.innerHTML = `<tr><td colspan='7' style='text-align:center; padding: 20px;'>No books found.</td></tr>`;
            return;
        }

        filteredEntries.forEach((entry, index) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${index + 1}</td>
                <td>${entry.date}</td>
                <td style="font-weight: 600; color: #2563eb;">${entry.publisher}</td>
                <td style="font-weight: bold;">${entry.bookName}</td>
                <td style="font-style: italic;">${entry.writer || '-'}</td>
                <td>${entry.part || '-'}</td>
                <td class="action-cell">
                    <button class="action-btn edit-btn btn-sm" data-index="${index}" title="Edit">✎</button>
                    <button class="action-btn delete-btn btn-sm" data-index="${index}" title="Delete">🗑</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }

    loadEditPublishers();
    loadPublisherBooks();

    if (tableBody) {
        tableBody.addEventListener("click", function(e) {
            let savedEntries = JSON.parse(localStorage.getItem("bookEntries")) || [];
            const index = e.target.getAttribute("data-index");
            let filteredEntries = selectedPub ? savedEntries.filter(entry => entry.publisher === selectedPub) : savedEntries;
            const entryToModify = filteredEntries[index];
            const realIndex = savedEntries.findIndex(o => 
                o.bookName === entryToModify.bookName && o.publisher === entryToModify.publisher && o.part === entryToModify.part
            );

            // --- DELETE Logic ---
            if (e.target.classList.contains("delete-btn")) {
                if (confirm(`Delete '${entryToModify.bookName}'?`)) {
                    const deleteRequestData = {
                        action: "delete", sheetName: "BookEntry", 
                        rowData: [entryToModify.date, entryToModify.publisher, entryToModify.bookName, entryToModify.writer, entryToModify.part]
                    };
                    
                    if(typeof scriptURL !== 'undefined') {
                        fetch(scriptURL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(deleteRequestData) });
                    }
                    if (realIndex > -1) {
                        savedEntries.splice(realIndex, 1);
                        localStorage.setItem("bookEntries", JSON.stringify(savedEntries));
                        loadPublisherBooks(); 
                    }
                }
            }

            // --- EDIT Logic ---
            if (e.target.classList.contains("edit-btn")) {
                document.getElementById("editIndex").value = realIndex;
                document.getElementById("oldDate").value = entryToModify.date;
                document.getElementById("oldPublisher").value = entryToModify.publisher;
                document.getElementById("oldBookName").value = entryToModify.bookName;
                document.getElementById("oldWriter").value = entryToModify.writer || "-";
                document.getElementById("oldPart").value = entryToModify.part || "-";

                document.getElementById("editDate").value = entryToModify.date;
                document.getElementById("editPublisher").value = entryToModify.publisher;
                document.getElementById("editBookName").value = entryToModify.bookName;
                document.getElementById("editWriter").value = entryToModify.writer === "-" ? "" : entryToModify.writer;
                document.getElementById("editPart").value = entryToModify.part === "-" ? "" : entryToModify.part;

                listView.style.display = "none";
                editView.style.display = "block";
            }
        });
    }

    document.getElementById("cancelEditBtn").addEventListener("click", () => {
        editView.style.display = "none"; listView.style.display = "block";
    });

    editBookForm.addEventListener("submit", function(e) {
        e.preventDefault();
        const submitBtn = editBookForm.querySelector(".btn-submit");
        const originalText = submitBtn.textContent;
        submitBtn.textContent = "Updating...";
        submitBtn.disabled = true;

        const realIndex = document.getElementById("editIndex").value;
        const oldData = [
            document.getElementById("oldDate").value, document.getElementById("oldPublisher").value,
            document.getElementById("oldBookName").value, document.getElementById("oldWriter").value, document.getElementById("oldPart").value
        ];

        const newData = [
            document.getElementById("editDate").value, document.getElementById("editPublisher").value,
            document.getElementById("editBookName").value.trim(), document.getElementById("editWriter").value.trim() || "-",
            document.getElementById("editPart").value.trim() || "-"
        ];

        const editRequestData = { action: "edit", sheetName: "BookEntry", oldData: oldData, newData: newData };

        if(typeof scriptURL !== 'undefined') {
            fetch(scriptURL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editRequestData) })
            .then(() => {
                let savedEntries = JSON.parse(localStorage.getItem("bookEntries")) || [];
                if (realIndex > -1) {
                    savedEntries[realIndex].date = newData[0]; savedEntries[realIndex].publisher = newData[1];
                    savedEntries[realIndex].bookName = newData[2]; savedEntries[realIndex].writer = newData[3];
                    savedEntries[realIndex].part = newData[4];
                    localStorage.setItem("bookEntries", JSON.stringify(savedEntries));
                }
                alert("Book Updated Successfully!");
                editView.style.display = "none"; listView.style.display = "block";
                loadPublisherBooks();
                submitBtn.textContent = originalText; submitBtn.disabled = false;
            });
        }
    });
});
