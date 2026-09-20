document.addEventListener("DOMContentLoaded", function() {
    const publisherSelect = document.getElementById("publisherSelect");
    const returnSection = document.getElementById("returnSection");
    const returnTableBody = document.getElementById("returnTableBody");

    function loadPublishers() {
        let savedPublishers = JSON.parse(localStorage.getItem("bookPublishers")) || [];
        let optionsHTML = '<option value="">-- Choose Publisher --</option>';
        savedPublishers.forEach(pub => { optionsHTML += `<option value="${pub}">${pub}</option>`; });
        if (publisherSelect) publisherSelect.innerHTML = optionsHTML;
    }
    loadPublishers();

    if (publisherSelect) {
        publisherSelect.addEventListener("change", function() {
            const pubName = this.value;
            if (!pubName) { returnSection.style.display = "none"; return; }
            loadReturnableBooks(pubName);
        });
    }

    function loadReturnableBooks(pubName) {
        let savedReceived = JSON.parse(localStorage.getItem("bookReceived")) || [];
        let savedReturn = JSON.parse(localStorage.getItem("bookReturn")) || [];
        let savedEntries = JSON.parse(localStorage.getItem("bookEntries")) || [];

        let bookMap = new Map();

        savedReceived.forEach(rec => {
            if (rec.publisher === pubName) {
                let key = rec.bookName + "|" + (rec.writer || "-") + "|" + (rec.part || "-");
                if (!bookMap.has(key)) {
                    let matchedEntry = savedEntries.find(e => e.publisher === pubName && e.bookName === rec.bookName && (e.part || "-") === rec.part);
                    let price = matchedEntry ? matchedEntry.price : 0;

                    bookMap.set(key, {
                        name: rec.bookName, writer: rec.writer || "-", part: rec.part || "-",
                        received: 0, returned: 0, rate: price
                    });
                }
                bookMap.get(key).received += parseFloat(rec.qty) || 0;
            }
        });

        savedReturn.forEach(ret => {
            if (ret.publisher === pubName) {
                let key = ret.bookName + "|" + (ret.writer || "-") + "|" + (ret.part || "-");
                if (bookMap.has(key)) {
                    bookMap.get(key).returned += parseFloat(ret.qty) || 0;
                }
            }
        });

        returnTableBody.innerHTML = "";
        let index = 1;
        let hasItems = false;

        bookMap.forEach((data, key) => {
            let maxReturnable = data.received - data.returned;
            if (maxReturnable > 0) {
                hasItems = true;
                
                // Default amount hisab kora (1 qty er jonno)
                let defaultRate = parseFloat(data.rate) || 0;
                let defaultAmt = (1 * defaultRate).toFixed(2);
                
                returnTableBody.innerHTML += `
                    <tr>
                        <td>${index++}</td>
                        <td style="font-weight:bold;">${data.name}</td>
                        <td style="font-style:italic;">${data.writer}</td>
                        <td>${data.part}</td>
                        <td style="color:#2563eb; font-weight:bold;">${maxReturnable}</td>
                        <td><input type="number" class="return-input r-qty" min="1" max="${maxReturnable}" value="1"></td>
                        <td><input type="number" class="return-input r-rate" value="${defaultRate}" step="0.01"></td>
                        <td class="r-amt" style="font-weight:bold;">${defaultAmt}</td>
                        <td><input type="number" class="return-input r-dis" value="0" step="0.01" style="width: 60px;"></td>
                        <td class="r-grand" style="font-weight:bold; color:#059669;">${defaultAmt}</td>
                        <td><button class="btn-submit save-return-btn" data-key="${key}" style="padding: 5px 10px;">Return</button></td>
                    </tr>
                `;
            }
        });

        if (!hasItems) {
            returnTableBody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:20px; color:gray;">No books available to return for this publisher.</td></tr>`;
        }

        returnSection.style.display = "block";
        attachReturnEvents(pubName);
    }

    function attachReturnEvents(pubName) {
        document.querySelectorAll(".return-table tr").forEach(row => {
            const qtyInput = row.querySelector(".r-qty");
            const rateInput = row.querySelector(".r-rate");
            const disInput = row.querySelector(".r-dis");
            const amtCell = row.querySelector(".r-amt");
            const grandCell = row.querySelector(".r-grand");
            const saveBtn = row.querySelector(".save-return-btn");

            if(!qtyInput) return;

            function updateRowTotal() {
                let q = parseFloat(qtyInput.value) || 0;
                let r = parseFloat(rateInput.value) || 0;
                let d = parseFloat(disInput.value) || 0;
                
                let amt = q * r;
                let grand = amt - (amt * d / 100);
                
                amtCell.textContent = amt.toFixed(2);
                grandCell.textContent = grand.toFixed(2);
            }

            qtyInput.addEventListener("input", updateRowTotal);
            rateInput.addEventListener("input", updateRowTotal);
            disInput.addEventListener("input", updateRowTotal);

            if(saveBtn) {
                saveBtn.addEventListener("click", function() {
                    let q = parseFloat(qtyInput.value) || 0;
                    let r = parseFloat(rateInput.value) || 0;
                    let d = parseFloat(disInput.value) || 0;
                    let max = parseFloat(qtyInput.getAttribute("max")) || 0;

                    if (q <= 0 || q > max) { alert("Invalid return quantity!"); return; }

                    let bName = row.children[1].textContent;
                    let bWriter = row.children[2].textContent;
                    let bPart = row.children[3].textContent;
                    
                    let amt = (q * r).toFixed(2);
                    let grand = (q * r - (q * r * d / 100)).toFixed(2);
                    let today = new Date().toISOString().split('T')[0];

                    const requestData = {
                        sheetName: "BookReturn",
                        rowData: [today, pubName, bName, bWriter, bPart, q, r, amt, d, grand]
                    };

                    let savedReturn = JSON.parse(localStorage.getItem("bookReturn")) || [];
                    // Ledger-er sathe match rakhar jonno 'grand' ta 'totalAmount' nam-e save kora hocche
                    savedReturn.push({ 
                        date: today, publisher: pubName, bookName: bName, writer: bWriter, part: bPart, 
                        qty: q, rate: r, amount: amt, discount: d, totalAmount: grand 
                    });
                    
                    localStorage.setItem("bookReturn", JSON.stringify(savedReturn));

                    this.textContent = "Saving...";
                    this.disabled = true;

                    if(typeof scriptURL !== 'undefined') {
                        fetch(scriptURL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestData) })
                        .then(() => {
                            alert("Book return recorded successfully!");
                            loadReturnableBooks(pubName);
                        });
                    }
                });
            }
        });
    }
});