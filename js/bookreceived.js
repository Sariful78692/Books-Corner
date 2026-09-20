document.addEventListener("DOMContentLoaded", function() {
    const publisherSelect = document.getElementById("publisherSelect");
    const pendingSection = document.getElementById("pendingSection");
    const pendingTableBody = document.getElementById("pendingTableBody");

    function loadPublishers() {
        let savedPublishers = JSON.parse(localStorage.getItem("bookPublishers")) || [];
        const receivedPublishers = (JSON.parse(localStorage.getItem("bookReceived")) || [])
            .map(row => row.publisher).filter(Boolean);
        const orderPublishers = (JSON.parse(localStorage.getItem("bookOrders")) || [])
            .map(row => row.publisher).filter(Boolean);
        const uniquePublishers = new Map();
        [...savedPublishers, ...receivedPublishers, ...orderPublishers].forEach(publisher => {
            const cleanName = String(publisher)
                .normalize("NFKC")
                .replace(/[\u200B-\u200D\uFEFF]/g, "")
                .replace(/\s+/g, " ")
                .trim();
            const publisherKey = cleanName.toLowerCase();
            if (cleanName && !uniquePublishers.has(publisherKey)) {
                uniquePublishers.set(publisherKey, cleanName);
            }
        });
        savedPublishers = [...uniquePublishers.values()];
        let optionsHTML = '<option value="">-- Choose Publisher --</option>';
        savedPublishers.forEach(pub => { optionsHTML += `<option value="${pub}">${pub}</option>`; });
        if (publisherSelect) publisherSelect.innerHTML = optionsHTML;
    }
    syncCloudData().catch(error => console.warn("Receive sync failed; using cached data", error))
        .finally(loadPublishers);

    if (publisherSelect) {
        publisherSelect.addEventListener("change", function() {
            const pubName = this.value;
            if (!pubName) { pendingSection.style.display = "none"; return; }
            loadPendingBooks(pubName);
        });
    }

    function loadPendingBooks(pubName) {
        let savedOrders = JSON.parse(localStorage.getItem("bookOrders")) || [];
        let savedReceived = JSON.parse(localStorage.getItem("bookReceived")) || [];
        
        let orderMap = new Map();
        
        savedOrders.forEach(order => {
            if (order.publisher === pubName) {
                let key = order.bookName + "|" + (order.writer || "-") + "|" + (order.part || "-");
                if (!orderMap.has(key)) {
                    orderMap.set(key, {
                        name: order.bookName, writer: order.writer || "-", part: order.part || "-",
                        ordered: 0, received: 0, 
                        rate: parseFloat(order.rate) || 0, discount: parseFloat(order.discount) || 0
                    });
                }
                orderMap.get(key).ordered += parseFloat(order.qty) || 0;
                // Update with latest order rate/discount just in case
                orderMap.get(key).rate = parseFloat(order.rate) || orderMap.get(key).rate;
                orderMap.get(key).discount = parseFloat(order.discount) || orderMap.get(key).discount;
            }
        });

        savedReceived.forEach(rec => {
            if (rec.publisher === pubName) {
                let key = rec.bookName + "|" + (rec.writer || "-") + "|" + (rec.part || "-");
                if (!orderMap.has(key)) {
                    orderMap.set(key, {
                        name: rec.bookName, writer: rec.writer || "-", part: rec.part || "-",
                        ordered: 0, received: 0, rate: parseFloat(rec.rate) || 0,
                        discount: parseFloat(rec.discount) || 0
                    });
                }
                if (orderMap.has(key)) {
                    orderMap.get(key).received += parseFloat(rec.qty) || 0;
                }
            }
        });

        pendingTableBody.innerHTML = "";
        let index = 1;
        let hasData = false;

        orderMap.forEach((data, key) => {
            // ⚠️ FIX: যেগুলোর অর্ডার এবং রিসিভ দুটোই ০, সেগুলো লিস্টে আর দেখাবে না।
            if (data.ordered <= 0 && data.received <= 0) return;

            hasData = true;
            let pendingQty = data.ordered - data.received;
            
            let inputHtml = '';
            let actionHtml = '';
            let rateHtml = '-', amtHtml = '-', disHtml = '-', grandHtml = '-';

            if (pendingQty > 0) {
                // Calculation default values for 1 qty
                let defRate = data.rate;
                let defDis = data.discount;
                let defAmt = (1 * defRate);
                let defGrand = defAmt - (defAmt * defDis / 100);

                inputHtml = `<input type="number" class="receive-input r-qty" min="1" max="${pendingQty}" value="1">`;
                rateHtml = `<input type="number" class="receive-input r-rate" value="${defRate}" step="0.01">`;
                amtHtml = `<span class="r-amt" style="font-weight:bold;">${defAmt.toFixed(2)}</span>`;
                disHtml = `<input type="number" class="receive-input r-dis" value="${defDis}" step="0.01" style="width: 50px;">`;
                grandHtml = `<span class="r-grand" style="font-weight:bold; color:#059669;">${defGrand.toFixed(2)}</span>`;
                
                actionHtml += `<button class="btn-submit receive-btn" data-key="${key}" style="padding: 6px 10px; height: 30px; display:flex; align-items:center;">✔️ Save</button>`;
            } else {
                inputHtml = `<span style="color:#059669; font-weight:bold;">Completed</span>`;
            }

            if (data.received > 0) {
                actionHtml += `
                    <button class="action-btn edit-btn btn-sm" data-key="${key}" title="Edit Total Received">✎</button>
                    <button class="action-btn delete-btn btn-sm" data-key="${key}" title="Reset/Delete All Received">🗑</button>
                `;
            }

            pendingTableBody.innerHTML += `
                <tr style="${pendingQty <= 0 ? 'background-color: #ecfdf5;' : ''}">
                    <td>${index++}</td>
                    <td style="font-weight:bold;">${data.name}</td>
                    <td style="font-style:italic;">${data.writer}</td>
                    <td>${data.part}</td>
                    <td style="font-weight:bold; color:#2563eb;">${data.ordered}</td>
                    <td style="font-weight:bold; color:#059669;">${data.received}</td>
                    <td style="font-weight:bold; color:#ef4444; font-size:15px;" class="pending-val">${pendingQty > 0 ? pendingQty : 0}</td>
                    <td>${inputHtml}</td>
                    <td>${rateHtml}</td>
                    <td>${amtHtml}</td>
                    <td>${disHtml}</td>
                    <td>${grandHtml}</td>
                    <td class="action-cell">${actionHtml}</td>
                </tr>
            `;
        });

        if (!hasData) {
            pendingTableBody.innerHTML = `<tr><td colspan="13" style="text-align:center; color:red; padding: 20px; font-weight:bold;">No active orders found for this publisher.</td></tr>`;
        }

        pendingSection.style.display = "block";
    }

    // ==========================================
    // Real-time calculation on input change
    // ==========================================
    pendingTableBody.addEventListener("input", function(e) {
        if (e.target.classList.contains("r-qty") || e.target.classList.contains("r-rate") || e.target.classList.contains("r-dis")) {
            let row = e.target.closest("tr");
            let q = parseFloat(row.querySelector(".r-qty").value) || 0;
            let r = parseFloat(row.querySelector(".r-rate").value) || 0;
            let d = parseFloat(row.querySelector(".r-dis").value) || 0;
            
            let amt = q * r;
            let grand = amt - (amt * d / 100);
            
            let amtCell = row.querySelector(".r-amt");
            let grandCell = row.querySelector(".r-grand");
            if(amtCell) amtCell.textContent = amt.toFixed(2);
            if(grandCell) grandCell.textContent = grand.toFixed(2);
        }
    });

    // ==========================================
    // Event Delegation: Save, Edit, Delete
    // ==========================================
    pendingTableBody.addEventListener("click", function(e) {
        let btn = e.target.closest("button");
        if (!btn) return;
        
        let key = btn.getAttribute("data-key");
        if (!key) return;
        
        let pubName = publisherSelect.value;
        let [bName, bWriter, bPart] = key.split("|");
        let savedReceived = JSON.parse(localStorage.getItem("bookReceived")) || [];
        
        // --- 1. SAVE BUTTON ---
        if (btn.classList.contains("receive-btn")) {
            let row = btn.closest("tr");
            let recQty = parseFloat(row.querySelector(".r-qty").value);
            let maxPending = parseFloat(row.querySelector(".pending-val").textContent);
            let rate = parseFloat(row.querySelector(".r-rate").value) || 0;
            let dis = parseFloat(row.querySelector(".r-dis").value) || 0;

            if (!recQty || recQty <= 0) { alert("Please enter a valid quantity to receive."); return; }
            if (recQty > maxPending) { alert("Received quantity cannot be greater than Pending quantity!"); row.querySelector(".r-qty").value = maxPending; return; }

            let amt = (recQty * rate).toFixed(2);
            let grand = (recQty * rate - (recQty * rate * dis / 100)).toFixed(2);
            let today = new Date().toISOString().split('T')[0];
            
            const requestData = { sheetName: "BookReceived", rowData: [today, pubName, bName, bWriter, bPart, recQty, rate, amt, dis, grand] };
            
            savedReceived.push({ date: today, publisher: pubName, bookName: bName, writer: bWriter, part: bPart, qty: recQty, rate: rate, amount: amt, discount: dis, grandTotal: grand });
            localStorage.setItem("bookReceived", JSON.stringify(savedReceived));

            btn.textContent = "..."; btn.disabled = true;
            if(typeof scriptURL !== 'undefined') fetch(scriptURL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestData) });
            
            alert(`${recQty} pcs received successfully!`);
            loadPendingBooks(pubName);
        }
        
        // --- 2. DELETE BUTTON ---
        else if (btn.classList.contains("delete-btn")) {
            if (confirm(`Are you sure you want to delete ALL received data for '${bName}' and make it fully pending again?`)) {
                let remainingRecords = [];
                savedReceived.forEach(rec => {
                    if (rec.publisher === pubName && rec.bookName === bName && (rec.writer || "-") === bWriter && (rec.part || "-") === bPart) {
                        const deleteReq = { action: "delete", sheetName: "BookReceived", rowData: [rec.date, rec.publisher, rec.bookName, rec.writer, rec.part] };
                        if(typeof scriptURL !== 'undefined') fetch(scriptURL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(deleteReq) });
                    } else {
                        remainingRecords.push(rec);
                    }
                });
                
                localStorage.setItem("bookReceived", JSON.stringify(remainingRecords));
                alert("Received data deleted successfully!");
                loadPendingBooks(pubName);
            }
        }
        
        // --- 3. EDIT BUTTON ---
        else if (btn.classList.contains("edit-btn")) {
            let currentTotal = 0;
            savedReceived.forEach(rec => {
                if (rec.publisher === pubName && rec.bookName === bName && (rec.writer || "-") === bWriter && (rec.part || "-") === bPart) {
                    currentTotal += parseFloat(rec.qty) || 0;
                }
            });
            
            let newTotalStr = prompt(`Edit Total Received Quantity for '${bName}':\n\nEnter the new TOTAL received amount:`, currentTotal);
            
            if (newTotalStr !== null) {
                let newTotal = parseFloat(newTotalStr);
                
                let savedOrders = JSON.parse(localStorage.getItem("bookOrders")) || [];
                let totalOrdered = 0, orderRate = 0, orderDis = 0;
                
                savedOrders.forEach(order => {
                    if (order.publisher === pubName && order.bookName === bName && (order.writer || "-") === bWriter && (order.part || "-") === bPart) {
                        totalOrdered += parseFloat(order.qty) || 0;
                        orderRate = parseFloat(order.rate) || 0;
                        orderDis = parseFloat(order.discount) || 0;
                    }
                });

                if (isNaN(newTotal) || newTotal < 0) { alert("Invalid quantity!"); return; }
                if (newTotal > totalOrdered) { alert(`Cannot exceed Total Ordered Quantity (${totalOrdered} pcs)!`); return; }
                
                // Delete old records
                let remainingRecords = [];
                savedReceived.forEach(rec => {
                    if (rec.publisher === pubName && rec.bookName === bName && (rec.writer || "-") === bWriter && (rec.part || "-") === bPart) {
                        const deleteReq = { action: "delete", sheetName: "BookReceived", rowData: [rec.date, rec.publisher, rec.bookName, rec.writer, rec.part] };
                        if(typeof scriptURL !== 'undefined') fetch(scriptURL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(deleteReq) });
                    } else {
                        remainingRecords.push(rec);
                    }
                });
                
                // Add new consolidated record
                if (newTotal > 0) {
                    let amt = (newTotal * orderRate).toFixed(2);
                    let grand = (newTotal * orderRate - (newTotal * orderRate * orderDis / 100)).toFixed(2);
                    let today = new Date().toISOString().split('T')[0];
                    
                    const addReq = { sheetName: "BookReceived", rowData: [today, pubName, bName, bWriter, bPart, newTotal, orderRate, amt, orderDis, grand] };
                    if(typeof scriptURL !== 'undefined') fetch(scriptURL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addReq) });
                    
                    remainingRecords.push({ date: today, publisher: pubName, bookName: bName, writer: bWriter, part: bPart, qty: newTotal, rate: orderRate, amount: amt, discount: orderDis, grandTotal: grand });
                }
                
                localStorage.setItem("bookReceived", JSON.stringify(remainingRecords));
                alert("Received quantity updated successfully!");
                loadPendingBooks(pubName);
            }
        }
    });
});
