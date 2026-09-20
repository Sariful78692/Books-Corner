document.addEventListener("DOMContentLoaded", function() {
    const classSelect = document.getElementById("classSelect");
    const addClassBtn = document.getElementById("addClassBtn");
    const editClassBtn = document.getElementById("editClassBtn");
    const deleteClassBtn = document.getElementById("deleteClassBtn");
    const bookListSection = document.getElementById("bookListSection");
    const bookListBody = document.getElementById("bookListBody");
    const displayClassName = document.getElementById("displayClassName");
    const saveClassBooksBtn = document.getElementById("saveClassBooksBtn");

    // ১. ক্লাস লোড করা
    function loadClasses() {
        let savedClasses = JSON.parse(localStorage.getItem("schoolClasses")) || ["Class V", "Class VI", "Class VII", "Class VIII", "Class IX", "Class X"];
        savedClasses = savedClasses.map(cls => typeof cls === "string" ? cls.trim() : (cls.name || cls.className || cls.value || "").toString().trim()).filter(Boolean);
        const uniqueClasses = [];
        const classKeys = new Set();
        savedClasses.forEach(cls => {
            const key = cls.toLowerCase();
            if (!classKeys.has(key)) { classKeys.add(key); uniqueClasses.push(cls); }
        });
        savedClasses = uniqueClasses;
        localStorage.setItem("schoolClasses", JSON.stringify(savedClasses));
        localStorage.setItem("schoolClasses", JSON.stringify(savedClasses)); // Default save
        
        classSelect.innerHTML = '<option value="">-- Choose Class --</option>';
        savedClasses.forEach(cls => {
            classSelect.innerHTML += `<option value="${cls}">${cls}</option>`;
        });
    }
    // Keep manually created classes while the shared database is syncing.
    const localManualClasses = JSON.parse(localStorage.getItem("schoolClasses")) || [];
    syncCloudData().catch(error => console.warn("Class book sync failed; using cached data", error))
        .finally(() => {
            const syncedClasses = JSON.parse(localStorage.getItem("schoolClasses")) || [];
            const mergedClasses = [...new Set([...syncedClasses, ...localManualClasses])];
            if (mergedClasses.length) localStorage.setItem("schoolClasses", JSON.stringify(mergedClasses));
            loadClasses();
        });

    // ২. নতুন ক্লাস যোগ করা
    addClassBtn.addEventListener("click", function() {
        let newClass = prompt("Enter New Class Name (e.g. Class XI):");
        if (newClass && newClass.trim() !== "") {
            let savedClasses = JSON.parse(localStorage.getItem("schoolClasses")) || [];
            if (!savedClasses.some(cls => cls.toLowerCase() === newClass.trim().toLowerCase())) {
                savedClasses.push(newClass.trim());
                let deleted = JSON.parse(localStorage.getItem("deletedClasses") || "[]");
                deleted = deleted.filter(name => name.toLowerCase() !== newClass.trim().toLowerCase());
                localStorage.setItem("deletedClasses", JSON.stringify(deleted));
                localStorage.setItem("schoolClasses", JSON.stringify(savedClasses));
                saveMasterData("Classes", newClass.trim());
                loadClasses();
                classSelect.value = newClass.trim();
                classSelect.dispatchEvent(new Event('change'));
                alert("Class Added Successfully!");
            } else {
                alert("This class already exists!");
            }
        }
    });

    editClassBtn.addEventListener("click", function() {
        const oldName = classSelect.value;
        if (!oldName) return alert("Please select a class first.");
        const newName = prompt("Edit Class Name:", oldName);
        if (!newName || !newName.trim() || newName.trim() === oldName) return;
        let classes = JSON.parse(localStorage.getItem("schoolClasses")) || [];
        if (classes.includes(newName.trim())) return alert("This class already exists!");
        classes[classes.indexOf(oldName)] = newName.trim();
        localStorage.setItem("schoolClasses", JSON.stringify(classes));
        let deleted = JSON.parse(localStorage.getItem("deletedClasses") || "[]");
        if (!deleted.some(name => name.toLowerCase() === className.toLowerCase())) deleted.push(className);
        localStorage.setItem("deletedClasses", JSON.stringify(deleted));
        deleteMasterData("Classes", oldName).then(() => saveMasterData("Classes", newName.trim()));
        loadClasses();
        classSelect.value = newName.trim();
        classSelect.dispatchEvent(new Event("change"));
    });

    deleteClassBtn.addEventListener("click", function() {
        const className = classSelect.value;
        if (!className) return alert("Please select a class first.");
        if (!confirm(`Delete '${className}' and its assigned books?`)) return;
        let classes = JSON.parse(localStorage.getItem("schoolClasses")) || [];
        localStorage.setItem("schoolClasses", JSON.stringify(classes.filter(cls => cls !== className)));
        let mappings = JSON.parse(localStorage.getItem("classBooksMapping")) || [];
        localStorage.setItem("classBooksMapping", JSON.stringify(mappings.filter(m => m.className !== className)));
        deleteMasterData("Classes", className);
        fetch(scriptURL, { method:"POST", mode:"no-cors", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action:"delete_class", sheetName:"ClassBooks", className:className}) });
        loadClasses();
        bookListSection.style.display = "none";
    });

    // ৩. ক্লাস সিলেক্ট করলে বইয়ের লিস্ট আসা
    classSelect.addEventListener("change", function() {
        let className = this.value;
        if (!className) {
            bookListSection.style.display = "none";
            return;
        }

        displayClassName.textContent = className;
        loadAllBooksForClass(className);
        bookListSection.style.display = "block";
    });

    function loadAllBooksForClass(className) {
        let savedEntries = JSON.parse(localStorage.getItem("bookEntries")) || [];
        let mappedClassBooks = JSON.parse(localStorage.getItem("classBooksMapping")) || [];
        
        // এই ক্লাসের জন্য আগে থেকে সিলেক্ট করা বইগুলো বের করা
        let thisClassBooks = mappedClassBooks.filter(m => m.className === className);
        
        // ইউনিক বইয়ের লিস্ট তৈরি করা (যাতে ডাবল না আসে)
        let uniqueBooksMap = new Map();
        savedEntries.forEach(e => {
            let key = e.bookName + "|" + (e.writer || "-") + "|" + (e.part || "-");
            if (!uniqueBooksMap.has(key)) {
                uniqueBooksMap.set(key, {
                    name: e.bookName, writer: e.writer || "-", part: e.part || "-",
                    publisher: e.publisher, price: e.price || 0
                });
            }
        });

        bookListBody.innerHTML = "";
        
        if(uniqueBooksMap.size === 0){
            bookListBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red;">No books found in Book Entry. Please add books first.</td></tr>`;
            return;
        }

        uniqueBooksMap.forEach((book, key) => {
            // চেক করা যে এই বইটি এই ক্লাসে অ্যাসাইন করা আছে কি না
            let isChecked = thisClassBooks.some(cb => cb.bookName === book.name && cb.part === book.part);
            
            let rowHtml = `
                <tr class="${isChecked ? 'highlight-row' : ''}">
                    <td style="text-align: center;">
                        <input type="checkbox" class="book-check" ${isChecked ? 'checked' : ''} 
                            data-name="${book.name}" data-writer="${book.writer}" 
                            data-part="${book.part}" data-price="${book.price}">
                    </td>
                    <td style="font-weight:bold;">${book.name}</td>
                    <td style="font-style:italic;">${book.writer}</td>
                    <td>${book.part}</td>
                    <td style="color:#6b7280; font-size:12px;">${book.publisher}</td>
                    <td style="font-weight:bold; color:#059669;">₹${book.price}</td>
                </tr>
            `;
            bookListBody.innerHTML += rowHtml;
        });

        // চেক বক্স ক্লিক করলে রো হাইলাইট হবে
        document.querySelectorAll(".book-check").forEach(chk => {
            chk.addEventListener("change", function() {
                if(this.checked) this.closest("tr").classList.add("highlight-row");
                else this.closest("tr").classList.remove("highlight-row");
            });
        });
    }

    // ৪. সেভ বাটন লজিক (ক্লাস অনুযায়ী বই ফিক্সড করা)
    saveClassBooksBtn.addEventListener("click", function() {
        let className = classSelect.value;
        if (!className) return;

        let checkboxes = document.querySelectorAll(".book-check:checked");
        if (checkboxes.length === 0) {
            if(!confirm("No books selected. Do you want to clear the list for this class?")) return;
        }

        // লোকাল স্টোরেজ আপডেট করা (পুরনো এই ক্লাসের ডেটা রিমুভ করে নতুনগুলো ঢোকানো)
        let mappedClassBooks = JSON.parse(localStorage.getItem("classBooksMapping")) || [];
        mappedClassBooks = mappedClassBooks.filter(m => m.className !== className);

        let newRecords = [];
        checkboxes.forEach(chk => {
            newRecords.push({
                className: className,
                bookName: chk.getAttribute("data-name"),
                writer: chk.getAttribute("data-writer"),
                part: chk.getAttribute("data-part"),
                price: chk.getAttribute("data-price")
            });
        });

        mappedClassBooks = mappedClassBooks.concat(newRecords);
        localStorage.setItem("classBooksMapping", JSON.stringify(mappedClassBooks));

        // গুগল শিটে ডেটা পাঠানো (আগে পুরনো ডেটা ডিলিট, তারপর নতুনগুলো সেভ)
        saveClassBooksBtn.textContent = "Saving...";
        saveClassBooksBtn.disabled = true;

        if(typeof scriptURL !== 'undefined') {
            // ১. ডিলিট রিকোয়েস্ট
            const deleteReq = { action: "delete_class", sheetName: "ClassBooks", className: className };
            fetch(scriptURL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(deleteReq) })
            .then(() => {
                // ২. নতুন ডেটা অ্যাড করা
                newRecords.forEach(rec => {
                    const addReq = { sheetName: "ClassBooks", rowData: [rec.className, rec.bookName, rec.writer, rec.part, rec.price] };
                    fetch(scriptURL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addReq) });
                });

                alert(`${newRecords.length} books successfully assigned to ${className}!`);
                saveClassBooksBtn.textContent = "💾 Save Class Books";
                saveClassBooksBtn.disabled = false;
            }).catch(()=>{
                alert("Saved locally! (Network/Script Error)");
                saveClassBooksBtn.textContent = "💾 Save Class Books";
                saveClassBooksBtn.disabled = false;
            });
        }
    });
});
