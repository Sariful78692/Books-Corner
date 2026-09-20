document.addEventListener("DOMContentLoaded", function() {
    const tableBody = document.getElementById("orderTableBody");
    const searchInput = document.getElementById("searchInput");
    const listView = document.getElementById("listView");
    const editOrderView = document.getElementById("editOrderView");
    const editOrderForm = document.getElementById("editOrderForm");
    
    const modalPubSelect = document.getElementById("modalPublisherSelect");
    const editPubSelect = document.getElementById("ePub");
    const printReceiptBtn = document.getElementById("printReceiptBtn");
    
    let lastOrderReceiptData = {}; 

    function loadPublishersDropdowns() {
        let savedPublishers = getActivePublishers();
        let optionsHTML = '<option value="">-- Choose Publisher --</option>';
        savedPublishers.forEach(pub => { optionsHTML += `<option value="${pub}">${pub}</option>`; });
        
        if (modalPubSelect) modalPubSelect.innerHTML = optionsHTML;
        if (editPubSelect) editPubSelect.innerHTML = optionsHTML;
    }
    syncCloudData().catch(error => console.warn("Order sync failed; using cached data", error))
        .finally(loadPublishersDropdowns);

    // ==========================================
    // ১. মূল টেবিল লোড
    // ==========================================
    function loadOrders() {
        let savedOrders = JSON.parse(localStorage.getItem("bookOrders")) || [];
        if (!tableBody) return;
        tableBody.innerHTML = "";
        
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";
        let validOrders = savedOrders.filter(o => parseFloat(o.qty) > 0);
        let filteredOrders = validOrders.filter(order => 
            order.publisher.toLowerCase().includes(searchTerm) || 
            order.bookName.toLowerCase().includes(searchTerm)
        );

        if (filteredOrders.length === 0) {
            tableBody.innerHTML = "<tr><td colspan='12' style='text-align:center; color:#6b7280;'>No Orders Found.</td></tr>";
            return;
        }

        filteredOrders.forEach((order, index) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${index + 1}</td>
                <td>${order.date}</td>
                <td style="font-weight:bold; color: #2563eb;">${order.publisher}</td>
                <td>${order.bookName}</td>
                <td style="font-style:italic;">${order.writer || '-'}</td>
                <td>${order.part || '-'}</td>
                <td style="font-weight:bold;">${order.qty}</td>
                <td>₹${order.rate}</td>
                <td>₹${order.amount}</td>
                <td>${order.discount}%</td>
                <td style="color: #059669; font-weight:bold;">${order.grandTotal}</td>
                <td class="action-cell">
                    <button class="action-btn edit-btn btn-sm" data-index="${index}" title="Edit">✎</button>
                    <button class="action-btn delete-btn btn-sm" data-index="${index}" title="Delete">🗑</button>
                    <button class="action-btn print-btn btn-sm" data-index="${index}" title="Print Invoice" style="background-color: #3b82f6;">🖨️</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }
    
    if(searchInput) searchInput.addEventListener("input", loadOrders);
    loadOrders();

    // ==========================================
    // ২. Invoice Generate & Direct Print Logic (Hidden Iframe)
    // ==========================================
    function generateInvoice(date, publisher, rowsHtml, tQty, tAmt, tDis, tGrand) {
        
        // Ager kono iframe thakle seta remove kora hocche
        let oldFrame = document.getElementById("printFrame");
        if (oldFrame) oldFrame.remove();

        // Notun ekta hidden iframe toiri kora hocche jate notun tab open na hoy
        let printFrame = document.createElement("iframe");
        printFrame.id = "printFrame";
        printFrame.style.position = "absolute";
        printFrame.style.width = "0";
        printFrame.style.height = "0";
        printFrame.style.border = "none";
        document.body.appendChild(printFrame);
        
        let receiptHTML = `
        <html>
        <head>
            <title>Order Invoice - BOOK'S CORNER</title>
            <style>
                @page { size: A4; margin: 20px; }
                body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #000; display: flex; flex-direction: column; min-height: 95vh; }
                
                .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 25px; }
                .header h1 { font-size: 34px; margin: 0; font-weight: bold; letter-spacing: 1px; }
                .header h3 { font-size: 18px; margin: 8px 0; font-weight: normal; }
                .header p { font-size: 14px; margin: 4px 0; }
                
                .info-bar { margin-bottom: 20px; display: flex; justify-content: space-between; font-size: 15px; font-weight: bold;}
                
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
                th, td { border: 1px solid #000; padding: 10px; text-align: left; }
                th { background-color: #f3f4f6 !important; -webkit-print-color-adjust: exact; }
                
                .totals { text-align: right; margin-bottom: 20px; font-size: 15px; }
                .totals p { margin: 8px 0; }
                .grand-total { font-size: 20px; font-weight: bold; margin-top: 15px; padding-top: 10px; border-top: 1px solid #000; display: inline-block; }
                
                .footer { display: flex; justify-content: flex-end; margin-top: auto; padding-top: 50px; }
                .signature { border-top: 1px solid #000; padding-top: 8px; width: 350px; text-align: center; font-weight: bold; font-size: 14px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>BOOK'S CORNER</h1>
                <h3>Run By:- Children's Corner</h3>
                <p>Address:- Vill- Sangrampur, PO- Kalikapota, PS- Usthi, Dist- South 24 Parganas, PIN- 743355</p>
                <p>Website: www.childrenscorner.in &nbsp;|&nbsp; E-mail: childrenscorner85@gmail.com</p>
            </div>
            
            <div class="info-bar">
                <div>Date: ${date}</div>
                <div>Publisher: ${publisher}</div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Sl</th><th>Book Name</th><th>Writer</th><th>Part</th>
                        <th>Qty</th><th>Rate</th><th>Amount</th><th>Dis %</th><th>G. Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>

            <div class="totals">
                <p>Total Books: <strong>${tQty} pcs</strong></p>
                <p>Total Amount: <strong>₹${tAmt}</strong></p>
                <p>Total Discount: <strong>₹${tDis}</strong></p>
                <div class="grand-total">Grand Total: ₹${tGrand}</div>
            </div>

            <div class="footer">
                <div class="signature">
                    Managing Trustee Signature / Authorize Book's Corner Signature
                </div>
            </div>
        </body>
        </html>
        `;
        
        let frameDoc = printFrame.contentWindow.document;
        frameDoc.open();
        frameDoc.write(receiptHTML);
        frameDoc.close();
        
        // Ekta choto timeout dewa hoyeche jate page load howar shathe shathei print popup hoy
        setTimeout(() => { 
            printFrame.contentWindow.focus();
            printFrame.contentWindow.print(); 
        }, 500);
    }

    // ==========================================
    // ৩. Table Action (Edit, Delete, O Purono Bill Print)
    // ==========================================
    if (tableBody) {
        tableBody.addEventListener("click", function(e) {
            const index = e.target.getAttribute("data-index");
            if(index === null) return;

            let savedOrders = JSON.parse(localStorage.getItem("bookOrders")) || [];
            let validOrders = savedOrders.filter(o => parseFloat(o.qty) > 0);
            
            const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";
            let filteredOrders = validOrders.filter(order => 
                order.publisher.toLowerCase().includes(searchTerm) || 
                order.bookName.toLowerCase().includes(searchTerm)
            );
            
            const orderToModify = filteredOrders[index];

            // --- Print Logic ---
            if (e.target.classList.contains("print-btn")) {
                let targetDate = orderToModify.date;
                let targetPub = orderToModify.publisher;
                
                let matchingOrders = savedOrders.filter(o => o.date === targetDate && o.publisher === targetPub && parseFloat(o.qty) > 0);
                
                let printRowsHtml = "";
                let printSl = 1;
                let totalQty = 0, totalAmt = 0, totalGrand = 0;

                matchingOrders.forEach(book => {
                    let qty = parseFloat(book.qty) || 0;
                    let amount = parseFloat(book.amount) || 0;
                    let grand = parseFloat(book.grandTotal) || 0;
                    
                    totalQty += qty;
                    totalAmt += amount;
                    totalGrand += grand;

                    printRowsHtml += `<tr>
                        <td>${printSl++}</td>
                        <td>${book.bookName}</td>
                        <td>${book.writer || '-'}</td>
                        <td>${book.part || '-'}</td>
                        <td>${qty}</td>
                        <td>₹${book.rate}</td>
                        <td>₹${book.amount}</td>
                        <td>${book.discount}%</td>
                        <td style="font-weight:bold;">₹${book.grandTotal}</td>
                    </tr>`;
                });

                let totalDis = totalAmt - totalGrand;
                generateInvoice(targetDate, targetPub, printRowsHtml, totalQty, totalAmt.toFixed(2), totalDis.toFixed(2), totalGrand.toFixed(2));
                return;
            }

            const realIndex = savedOrders.findIndex(o => 
                o.bookName === orderToModify.bookName && 
                o.date === orderToModify.date &&
                o.publisher === orderToModify.publisher &&
                o.qty === orderToModify.qty 
            );

            // --- Delete Logic ---
            if (e.target.classList.contains("delete-btn")) {
                if (confirm(`Are you sure you want to delete the order for '${orderToModify.bookName}'?`)) {
                    const deleteRequestData = {
                        action: "delete", sheetName: "Order", 
                        rowData: [orderToModify.date, orderToModify.publisher, orderToModify.bookName, orderToModify.writer, orderToModify.part]
                    };
                    
                    if(typeof scriptURL !== 'undefined') {
                        fetch(scriptURL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(deleteRequestData) });
                    }

                    if (realIndex > -1) {
                        savedOrders.splice(realIndex, 1);
                        localStorage.setItem("bookOrders", JSON.stringify(savedOrders));
                        loadOrders(); 
                        alert("Order deleted successfully!");
                    }
                }
            }

            // --- Edit Logic ---
            if (e.target.classList.contains("edit-btn")) {
                document.getElementById("editOrderIndex").value = realIndex;
                document.getElementById("eOldDate").value = orderToModify.date;
                document.getElementById("eOldPublisher").value = orderToModify.publisher;
                document.getElementById("eOldBookName").value = orderToModify.bookName;
                document.getElementById("eOldWriter").value = orderToModify.writer || "-";
                document.getElementById("eOldPart").value = orderToModify.part || "-";

                document.getElementById("eDate").value = orderToModify.date;
                document.getElementById("ePub").value = orderToModify.publisher;
                document.getElementById("eBook").value = orderToModify.bookName;
                document.getElementById("eWriter").value = orderToModify.writer === "-" ? "" : (orderToModify.writer || "");
                document.getElementById("ePart").value = orderToModify.part === "-" ? "" : (orderToModify.part || "");

                document.getElementById("eQty").value = orderToModify.qty;
                document.getElementById("eRate").value = orderToModify.rate;
                document.getElementById("eDis").value = orderToModify.discount;
                document.getElementById("eAmount").value = orderToModify.amount;
                document.getElementById("eGrand").value = orderToModify.grandTotal;

                listView.style.display = "none";
                editOrderView.style.display = "block";
            }
        });
    }

    // ==========================================
    // ৪. Edit Form Submit
    // ==========================================
    function calcEditTotals() {
        let q = parseFloat(document.getElementById("eQty").value) || 0;
        let r = parseFloat(document.getElementById("eRate").value) || 0;
        let d = parseFloat(document.getElementById("eDis").value) || 0;
        let amt = q * r;
        let grand = amt - (amt * d / 100);
        document.getElementById("eAmount").value = amt > 0 ? amt.toFixed(2) : "0.00";
        document.getElementById("eGrand").value = grand > 0 ? grand.toFixed(2) : "0.00";
    }
    
    document.getElementById("eQty").addEventListener("input", calcEditTotals);
    document.getElementById("eRate").addEventListener("input", calcEditTotals);
    document.getElementById("eDis").addEventListener("input", calcEditTotals);

    document.getElementById("cancelEditOrderBtn").addEventListener("click", function() {
        editOrderView.style.display = "none";
        listView.style.display = "block";
    });

    editOrderForm.addEventListener("submit", function(e) {
        e.preventDefault();
        const submitBtn = editOrderForm.querySelector(".btn-submit");
        const originalText = submitBtn.textContent;
        submitBtn.textContent = "Updating...";
        submitBtn.disabled = true;

        const realIndex = document.getElementById("editOrderIndex").value;
        const oldData = [
            document.getElementById("eOldDate").value, document.getElementById("eOldPublisher").value,
            document.getElementById("eOldBookName").value, document.getElementById("eOldWriter").value, document.getElementById("eOldPart").value
        ];

        const newData = [
            document.getElementById("eDate").value, document.getElementById("ePub").value, document.getElementById("eBook").value.trim(),
            document.getElementById("eWriter").value.trim() || "-", document.getElementById("ePart").value.trim() || "-",
            document.getElementById("eQty").value, document.getElementById("eRate").value, document.getElementById("eAmount").value,
            document.getElementById("eDis").value || 0, document.getElementById("eGrand").value
        ];

        const editRequestData = { action: "edit", sheetName: "Order", oldData: oldData, newData: newData };

        if(typeof scriptURL !== 'undefined') {
            fetch(scriptURL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editRequestData)
            }).then(() => {
                let savedOrders = JSON.parse(localStorage.getItem("bookOrders")) || [];
                if (realIndex > -1) {
                    savedOrders[realIndex].date = newData[0]; savedOrders[realIndex].publisher = newData[1]; savedOrders[realIndex].bookName = newData[2];
                    savedOrders[realIndex].writer = newData[3]; savedOrders[realIndex].part = newData[4]; savedOrders[realIndex].qty = newData[5];
                    savedOrders[realIndex].rate = newData[6]; savedOrders[realIndex].amount = newData[7]; savedOrders[realIndex].discount = newData[8];
                    savedOrders[realIndex].grandTotal = newData[9]; localStorage.setItem("bookOrders", JSON.stringify(savedOrders));
                }
                alert("Order Updated Successfully!");
                editOrderView.style.display = "none"; listView.style.display = "block";
                loadOrders(); submitBtn.textContent = originalText; submitBtn.disabled = false;
            }).catch(() => {
                alert("Something went wrong!"); submitBtn.textContent = originalText; submitBtn.disabled = false;
            });
        }
    });

    // ==========================================
    // ৫. Create Order Modal
    // ==========================================
    const modal = document.getElementById("orderModal");
    const openBtn = document.getElementById("openModalBtn");
    const closeBtn = document.getElementById("closeModalBtn");
    const modalBookList = document.getElementById("modalBookList");
    const submitOrderBtn = document.getElementById("submitOrderBtn");

    if(openBtn) {
        openBtn.onclick = function() {
            modal.style.display = "block";
            submitOrderBtn.style.display = "inline-block";
            if(printReceiptBtn) printReceiptBtn.style.display = "none";
            loadPublishersDropdowns();
            modalBookList.innerHTML = "<tr><td colspan='9' style='text-align:center;'>Please select a publisher to view books.</td></tr>";
            calculateGrandTotals(); 
        }
    }
    if(closeBtn) closeBtn.onclick = () => modal.style.display = "none";

    if (modalPubSelect) {
        modalPubSelect.addEventListener("change", function() {
            const pubName = this.value;
            modalBookList.innerHTML = "";
            if(!pubName) {
                modalBookList.innerHTML = "<tr><td colspan='9' style='text-align:center;'>Please select a publisher to view books.</td></tr>";
                calculateGrandTotals(); return;
            }

            let savedEntries = JSON.parse(localStorage.getItem("bookEntries")) || [];
            let uniqueBooksMap = new Map();
            savedEntries.forEach(e => {
                if (e.publisher === pubName) {
                    let key = e.bookName + "|" + (e.part || "-");
                    if (!uniqueBooksMap.has(key)) {
                        uniqueBooksMap.set(key, { name: e.bookName, writer: e.writer || "-", part: e.part || "-", price: e.price || "" });
                    }
                }
            });
            
            let pubBooks = Array.from(uniqueBooksMap.values());
            if(pubBooks.length === 0) {
                modalBookList.innerHTML = `<tr><td colspan="9" style="text-align:center; color:red; padding: 20px;">No books found.</td></tr>`;
                calculateGrandTotals(); return;
            }

            pubBooks.forEach((book, i) => {
                let defaultRate = book.price ? book.price : "";
                modalBookList.innerHTML += `
                    <tr class="book-row">
                        <td style="text-align:center;"><input type="checkbox" class="book-check"></td>
                        <td class="b-name" style="font-weight:600;">${book.name}</td>
                        <td class="b-writer" style="font-style:italic;">${book.writer}</td>
                        <td class="b-part">${book.part}</td>
                        <td><input type="number" class="b-qty" value="" placeholder="Qty" min="1" disabled></td>
                        <td><input type="number" class="b-rate" value="${defaultRate}" placeholder="Rate" min="0" step="0.01" disabled></td>
                        <td class="b-amount">0.00</td>
                        <td><input type="number" class="b-dis" value="" placeholder="Dis %" min="0" step="0.01" disabled></td>
                        <td class="b-grand" style="font-weight:bold; color: #2563eb;">0.00</td>
                    </tr>
                `;
            });
            attachRowEvents(); calculateGrandTotals();
        });
    }

    function attachRowEvents() {
        const rows = document.querySelectorAll(".book-row");
        rows.forEach(row => {
            const checkbox = row.querySelector(".book-check");
            const inputs = row.querySelectorAll("input[type='number']");
            checkbox.addEventListener("change", function() {
                inputs.forEach(input => { input.disabled = !this.checked; });
                calculateGrandTotals();
            });
            inputs.forEach(input => input.addEventListener("input", () => {
                calculateRow(row); calculateGrandTotals();
            }));
        });
    }

    function calculateRow(row) {
        let qty = parseFloat(row.querySelector(".b-qty").value) || 0;
        let rate = parseFloat(row.querySelector(".b-rate").value) || 0;
        let dis = parseFloat(row.querySelector(".b-dis").value) || 0;
        let amount = qty * rate;
        let grand = amount - (amount * dis / 100);
        
        row.querySelector(".b-amount").textContent = amount > 0 ? amount.toFixed(2) : "0.00";
        row.querySelector(".b-grand").textContent = grand > 0 ? grand.toFixed(2) : "0.00";
    }

    function calculateGrandTotals() {
        let tBooks = 0, tAmt = 0, tDis = 0, tGrand = 0;
        document.querySelectorAll(".book-row").forEach(row => {
            if (row.querySelector(".book-check").checked) {
                let qty = parseFloat(row.querySelector(".b-qty").value) || 0;
                let amt = parseFloat(row.querySelector(".b-amount").textContent) || 0;
                let grand = parseFloat(row.querySelector(".b-grand").textContent) || 0;
                tBooks += qty; tAmt += amt; tGrand += grand;
            }
        });
        document.getElementById("totBooks").textContent = tBooks;
        document.getElementById("totAmount").textContent = tAmt.toFixed(2);
        document.getElementById("totDiscount").textContent = (tAmt - tGrand).toFixed(2);
        document.getElementById("totGrand").textContent = tGrand.toFixed(2);
    }

    if(submitOrderBtn) {
        submitOrderBtn.addEventListener("click", function() {
            let selectedRows = [...document.querySelectorAll(".book-row")].filter(row => row.querySelector(".book-check").checked);
            if(selectedRows.length === 0) return alert("Please check at least one book to order."); 

            let savedOrders = JSON.parse(localStorage.getItem("bookOrders")) || [];
            let pubName = modalPubSelect.value;
            let today = new Date().toISOString().split('T')[0];
            let errorFlag = false;

            selectedRows.forEach(row => {
                let qtyVal = row.querySelector(".b-qty").value;
                let rateVal = row.querySelector(".b-rate").value;
                if(!qtyVal || !rateVal) errorFlag = true;
            });

            if (errorFlag) {
                alert("Please enter Qty and Rate for selected books!");
                return;
            }
            
            let printRowsHtml = "";
            let printSl = 1;
            let totalQty = 0, totalAmt = 0, totalGrand = 0;

            selectedRows.forEach(row => {
                let bName = row.querySelector(".b-name").textContent;
                let bWriter = row.querySelector(".b-writer").textContent;
                let bPart = row.querySelector(".b-part").textContent;
                let qty = row.querySelector(".b-qty").value;
                let rate = row.querySelector(".b-rate").value;
                let amount = row.querySelector(".b-amount").textContent;
                let dis = row.querySelector(".b-dis").value || 0;
                let grand = row.querySelector(".b-grand").textContent;
                
                totalQty += parseFloat(qty);
                totalAmt += parseFloat(amount);
                totalGrand += parseFloat(grand);

                printRowsHtml += `<tr>
                    <td>${printSl++}</td>
                    <td>${bName}</td>
                    <td>${bWriter}</td>
                    <td>${bPart}</td>
                    <td>${qty}</td>
                    <td>₹${rate}</td>
                    <td>₹${amount}</td>
                    <td>${dis}%</td>
                    <td style="font-weight:bold;">₹${grand}</td>
                </tr>`;

                const requestData = { sheetName: "Order", rowData: [today, pubName, bName, bWriter, bPart, qty, rate, amount, dis, grand] };

                savedOrders.push({
                    date: today, publisher: pubName, bookName: bName, writer: bWriter, part: bPart,
                    qty: qty, rate: rate, amount: amount, discount: dis, grandTotal: grand
                });

                if(typeof scriptURL !== 'undefined') fetch(scriptURL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestData) });
            });

            let totalDis = totalAmt - totalGrand;

            lastOrderReceiptData = {
                date: today, publisher: pubName, rows: printRowsHtml,
                tQty: totalQty, tAmt: totalAmt.toFixed(2), tDis: totalDis.toFixed(2), tGrand: totalGrand.toFixed(2)
            };

            localStorage.setItem("bookOrders", JSON.stringify(savedOrders));
            loadOrders();
            alert("Order Submitted Successfully! You can now print the receipt.");
            
            submitOrderBtn.style.display = "none";
            if(printReceiptBtn) printReceiptBtn.style.display = "inline-block";
        });
    }

    if (printReceiptBtn) {
        printReceiptBtn.addEventListener("click", function() {
            if (!lastOrderReceiptData.date) return;
            generateInvoice(
                lastOrderReceiptData.date, 
                lastOrderReceiptData.publisher, 
                lastOrderReceiptData.rows, 
                lastOrderReceiptData.tQty, 
                lastOrderReceiptData.tAmt, 
                lastOrderReceiptData.tDis, 
                lastOrderReceiptData.tGrand
            );
            modal.style.display = "none"; 
        });
    }
});
