document.addEventListener("DOMContentLoaded", function() {
    const publisherSelect = document.getElementById("publisherSelect");
    const ledgerSection = document.getElementById("ledgerSection");
    const ledgerTableBody = document.getElementById("ledgerTableBody");
    const savePaymentBtn = document.getElementById("savePaymentBtn");
    const ledgerFromDate = document.getElementById("ledgerFromDate");
    const ledgerToDate = document.getElementById("ledgerToDate");
    let selectedPublisher = "";

    function inLedgerDateRange(value) {
        const date = String(value || "").slice(0, 10);
        return (!ledgerFromDate.value || date >= ledgerFromDate.value) &&
            (!ledgerToDate.value || date <= ledgerToDate.value);
    }

    document.getElementById("applyLedgerDateBtn").addEventListener("click", function() {
        if (selectedPublisher) generateLedger(selectedPublisher);
    });
    document.getElementById("clearLedgerDateBtn").addEventListener("click", function() {
        ledgerFromDate.value = "";
        ledgerToDate.value = "";
        if (selectedPublisher) generateLedger(selectedPublisher);
    });

    // ১. পাবলিশার লিস্ট লোড করা
    function loadPublishers() {
        let savedPublishers = getActivePublishers();
        let optionsHTML = '<option value="">-- Choose Publisher --</option>';
        savedPublishers.forEach(pub => { optionsHTML += `<option value="${pub}">${pub}</option>`; });
        if (publisherSelect) publisherSelect.innerHTML = optionsHTML;
    }
    syncCloudData().catch(error => console.warn("Publisher sync failed; using cached data", error))
        .finally(loadPublishers);

    if (publisherSelect) {
        publisherSelect.addEventListener("change", function() {
            selectedPublisher = this.value;
            if (!this.value) { ledgerSection.style.display = "none"; return; }
            generateLedger(this.value);
        });
    }

    // ২. লেজার ও হিস্ট্রি জেনারেট করা
    function generateLedger(pubName) {
        let savedReceived = JSON.parse(localStorage.getItem("bookReceived")) || [];
        let savedOrders = JSON.parse(localStorage.getItem("bookOrders")) || [];
        let savedReturn = JSON.parse(localStorage.getItem("bookReturn")) || [];
        let savedPayments = JSON.parse(localStorage.getItem("publisherPayments")) || [];

        let transactions = [];
        let totalRec = 0, totalRet = 0, totalPaid = 0;

        // A. Received Data (Bill Amount)
        savedReceived.forEach(rec => {
            if (rec.publisher === pubName && inLedgerDateRange(rec.date)) {
                let amt = parseFloat(rec.grandTotal) || 0;
                totalRec += amt;
                transactions.push({
                    date: rec.date,
                    type: 'Received',
                    desc: `${rec.qty}x ${rec.bookName} (Part: ${rec.part || '-'})`,
                    orderedQty: savedOrders.filter(order => order.publisher === pubName && inLedgerDateRange(order.date) && order.bookName === rec.bookName && (order.writer || '-') === (rec.writer || '-') && (order.part || '-') === (rec.part || '-')).reduce((sum, order) => sum + (parseFloat(order.qty) || 0), 0),
                    receivedQty: parseFloat(rec.qty) || 0,
                    returnedQty: 0,
                    billAmt: amt,
                    paidRetAmt: 0
                });
            }
        });

        // B. Return Data (Minus from Bill)
        savedReturn.forEach(ret => {
            if (ret.publisher === pubName && inLedgerDateRange(ret.date)) {
                let amt = parseFloat(ret.totalAmount) || parseFloat(ret.grandTotal) || 0;
                totalRet += amt;
                transactions.push({
                    date: ret.date,
                    type: 'Return',
                    desc: `${ret.qty}x ${ret.bookName} (Returned)`,
                    orderedQty: 0, receivedQty: 0,
                    returnedQty: parseFloat(ret.qty) || 0,
                    billAmt: 0,
                    paidRetAmt: amt
                });
            }
        });

        // C. Payment Data (Minus from Bill)
        savedPayments.forEach((pay, index) => {
            if (pay.publisher === pubName && inLedgerDateRange(pay.date)) {
                let amt = parseFloat(pay.amount) || 0;
                totalPaid += amt;
                transactions.push({
                    realIndex: index, // ডিলিট করার জন্য ইনডেক্স ধরে রাখা হলো
                    date: pay.date,
                    type: 'Payment',
                    desc: pay.note || 'Cash',
                    orderedQty: 0, receivedQty: 0,
                    returnedQty: 0,
                    billAmt: 0,
                    paidRetAmt: amt
                });
            }
        });

        // তারিখ অনুযায়ী সাজানো (Oldest to Newest)
        transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

        // D. Summary আপডেট করা
        let currentDue = totalRec - totalRet - totalPaid;
        
        document.getElementById("sumReceived").textContent = `₹${totalRec.toFixed(2)}`;
        document.getElementById("sumReturned").textContent = `₹${totalRet.toFixed(2)}`;
        document.getElementById("sumPaid").textContent = `₹${totalPaid.toFixed(2)}`;
        document.getElementById("sumDue").textContent = `₹${currentDue.toFixed(2)}`;

        // E. Table আপডেট করা
        ledgerTableBody.innerHTML = "";
        let runningBalance = 0;

        if (transactions.length === 0) {
            ledgerTableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 20px; color:gray;">No transactions found for this publisher.</td></tr>`;
        } else {
            transactions.forEach(tr => {
                runningBalance += tr.billAmt;
                runningBalance -= tr.paidRetAmt;

                let typeBadge = '';
                let actionBtn = '';

                if (tr.type === 'Received') typeBadge = '<span class="badge b-rec">Received</span>';
                else if (tr.type === 'Return') typeBadge = '<span class="badge b-ret">Return</span>';
                else if (tr.type === 'Payment') {
                    typeBadge = '<span class="badge b-pay">Payment</span>';
                    // পেমেন্টের পাশে ডিলিট বাটন
                    actionBtn = `<button class="delete-pay-btn" data-index="${tr.realIndex}" style="background-color:#ef4444; color:white; border:none; border-radius:3px; padding:3px 8px; cursor:pointer; font-size:12px; margin-left:15px; font-weight:bold;">🗑 Delete</button>`;
                }

                ledgerTableBody.innerHTML += `
                    <tr>
                        <td>${tr.date}</td>
                        <td>${typeBadge}</td>
                        <td>${tr.desc} ${actionBtn}</td>
                        <td style="text-align:right;">${tr.orderedQty || '-'}</td>
                        <td style="text-align:right;">${tr.receivedQty || '-'}</td>
                        <td style="text-align:right; color:#dc2626;">${tr.returnedQty || '-'}</td>
                        <td style="text-align: right; color:#2563eb; font-weight:bold;">${tr.billAmt > 0 ? '₹' + tr.billAmt.toFixed(2) : '-'}</td>
                        <td style="text-align: right; color:#059669; font-weight:bold;">${tr.paidRetAmt > 0 ? '₹' + tr.paidRetAmt.toFixed(2) : '-'}</td>
                        <td style="text-align: right; background-color: #fef3c7; font-weight:bold; color: ${runningBalance < 0 ? 'red' : 'black'}">₹${runningBalance.toFixed(2)}</td>
                    </tr>
                `;
            });
        }

        document.getElementById("payDate").value = new Date().toISOString().split('T')[0];
        ledgerSection.style.display = "block";
    }

    // ৩. পেমেন্ট সেভ করা
    if (savePaymentBtn) {
        savePaymentBtn.addEventListener("click", function() {
            const pubName = publisherSelect.value;
            if (!pubName) return alert("Select a publisher first!");

            let pDate = document.getElementById("payDate").value;
            let pAmt = parseFloat(document.getElementById("payAmount").value);
            let pNote = document.getElementById("payNote").value || "Cash";

            if (!pAmt || pAmt <= 0) return alert("Please enter a valid payment amount!");

            const requestData = {
                sheetName: "PublisherPayment",
                rowData: [pDate, pubName, pAmt, pNote]
            };

            let savedPayments = JSON.parse(localStorage.getItem("publisherPayments")) || [];
            savedPayments.push({ date: pDate, publisher: pubName, amount: pAmt, note: pNote });
            
            savePaymentBtn.textContent = "Saving...";
            savePaymentBtn.disabled = true;

            if (typeof scriptURL !== 'undefined') {
                fetch(scriptURL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestData) })
                .then(() => {
                    localStorage.setItem("publisherPayments", JSON.stringify(savedPayments));
                    alert("Payment recorded successfully!");
                    
                    document.getElementById("payAmount").value = "";
                    document.getElementById("payNote").value = "Cash"; // ডিফল্ট Cash এ রিসেট
                    savePaymentBtn.textContent = "Save Payment";
                    savePaymentBtn.disabled = false;
                    
                    generateLedger(pubName); // লেজার রিফ্রেশ
                })
                .catch(err => {
                    alert("Error saving payment!");
                    savePaymentBtn.textContent = "Save Payment";
                    savePaymentBtn.disabled = false;
                });
            }
        });
    }

    // ৪. পেমেন্ট ডিলিট করা
    if (ledgerTableBody) {
        ledgerTableBody.addEventListener("click", function(e) {
            if (e.target.classList.contains("delete-pay-btn")) {
                const index = e.target.getAttribute("data-index");
                if (index === null) return;

                let savedPayments = JSON.parse(localStorage.getItem("publisherPayments")) || [];
                let payToDelete = savedPayments[index];

                if (confirm(`Are you sure you want to delete this payment of ₹${payToDelete.amount} made on ${payToDelete.date}?`)) {
                    
                    // গুগল শিটের জন্য রিকোয়েস্ট (Date, Publisher Name, Amount Paid দিয়ে ডিলিট হবে)
                    const deleteRequestData = {
                        action: "delete",
                        sheetName: "PublisherPayment",
                        rowData: [payToDelete.date, payToDelete.publisher, payToDelete.amount]
                    };

                    if(typeof scriptURL !== 'undefined') {
                        fetch(scriptURL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(deleteRequestData) });
                    }

                    // লোকাল স্টোরেজ থেকে মুছে ফেলা
                    savedPayments.splice(index, 1);
                    localStorage.setItem("publisherPayments", JSON.stringify(savedPayments));
                    
                    alert("Payment deleted successfully!");
                    generateLedger(publisherSelect.value); // টেবিল অটোমেটিক আপডেট হবে
                }
            }
        });
    }
});
