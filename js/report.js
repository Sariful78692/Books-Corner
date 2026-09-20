document.addEventListener("DOMContentLoaded", function() {
    const fromDateInput = document.getElementById("reportFromDate");
    const toDateInput = document.getElementById("reportToDate");

    function inDateRange(value) {
        const date = String(value || "").slice(0, 10);
        const from = fromDateInput.value;
        const to = toDateInput.value;
        return (!from || date >= from) && (!to || date <= to);
    }

    document.getElementById("applyReportDateBtn").addEventListener("click", generateReports);
    document.getElementById("clearReportDateBtn").addEventListener("click", function() {
        fromDateInput.value = "";
        toDateInput.value = "";
        generateReports();
    });
    
    // লোড ডেটা ফ্রম লোকাল স্টোরেজ
    syncCloudData().catch(error => console.warn("Report sync failed; using cached data", error))
        .finally(generateReports);

    function generateReports() {
        const savedReceived = JSON.parse(localStorage.getItem("bookReceived")) || [];
        const savedReturn = JSON.parse(localStorage.getItem("bookReturn")) || [];
        const savedSales = JSON.parse(localStorage.getItem("bookSales")) || [];
        processSalesAndDues(savedSales.filter(item => inDateRange(item.date)));
        processStockInventory(
            savedReceived.filter(item => inDateRange(item.date)),
            savedReturn.filter(item => inDateRange(item.date)),
            savedSales.filter(item => inDateRange(item.date))
        );
    }

    // ==========================================
    // 1. Sales History, Due List & Missed Books Logic
    // ==========================================
    function processSalesAndDues(salesData) {
        let invoiceMap = new Map();
        let totalSales = 0;
        let totalCollected = 0;
        let totalDue = 0;

        // ডেটাগুলোকে ইনভয়েস নাম্বার অনুযায়ী গ্রুপ করা
        salesData.forEach(sale => {
            let inv = sale.invoiceNo;
            if (!invoiceMap.has(inv)) {
                invoiceMap.set(inv, {
                    date: sale.date,
                    customer: sale.customer,
                    mobile: sale.mobile || "-",
                    className: sale.class,
                    billAmount: 0,
                    paid: parseFloat(sale.paid) || 0,
                    due: parseFloat(sale.due) || 0,
                    missedBooks: sale.missedBooks || [] // প্রথম সারি থেকে না-নেওয়া বইয়ের লিস্ট
                });
            }
            invoiceMap.get(inv).billAmount += parseFloat(sale.grandTotal) || 0;
        });

        const salesTable = document.getElementById("salesTableBody");
        const dueTable = document.getElementById("dueTableBody");
        const missedTable = document.getElementById("missedTableBody");

        salesTable.innerHTML = "";
        dueTable.innerHTML = "";
        missedTable.innerHTML = "";

        let hasSales = false, hasDues = false, hasMissed = false;

        // ম্যাপ থেকে ডেটা নিয়ে টেবিলে বসানো
        invoiceMap.forEach((data, inv) => {
            hasSales = true;
            totalSales += data.billAmount;
            totalCollected += data.paid;
            totalDue += data.due;

            // Status Badge
            let statusBadge = '';
            if (data.due > 0) statusBadge = `<span class="badge badge-warning">Due: ₹${data.due.toFixed(2)}</span>`;
            else statusBadge = `<span class="badge badge-success">Paid</span>`;

            // A. Sales Table Row
            salesTable.innerHTML += `
                <tr>
                    <td>${data.date}</td>
                    <td style="font-weight:bold; color:#2563eb;">${inv}</td>
                    <td>${data.customer}</td>
                    <td>${data.className}</td>
                    <td style="font-weight:bold;">₹${data.billAmount.toFixed(2)}</td>
                    <td style="color:#059669; font-weight:bold;">₹${data.paid.toFixed(2)}</td>
                    <td>${statusBadge}</td>
                </tr>
            `;

            // B. Due Table Row (যদি ডিউ থাকে)
            if (data.due > 0) {
                hasDues = true;
                dueTable.innerHTML += `
                    <tr>
                        <td>${data.date}</td>
                        <td style="font-weight:bold;">${data.customer}</td>
                        <td>${data.mobile}</td>
                        <td style="color:#2563eb;">${inv}</td>
                        <td>₹${data.billAmount.toFixed(2)}</td>
                        <td style="font-weight:bold; color:#ef4444; font-size:16px;">₹${data.due.toFixed(2)}</td>
                    </tr>
                `;
            }

            // C. Missed Books Table Row (যদি কোনো বই না নিয়ে থাকে)
            if (data.missedBooks && data.missedBooks.length > 0) {
                hasMissed = true;
                let booksList = data.missedBooks.map(b => `<span class="badge badge-danger" style="margin:2px; display:inline-block;">${b}</span>`).join(" ");
                missedTable.innerHTML += `
                    <tr>
                        <td>${data.date}</td>
                        <td style="font-weight:bold;">${data.customer}</td>
                        <td>${data.className}</td>
                        <td>${booksList}</td>
                    </tr>
                `;
            }
        });

        // Summary Cards আপডেট করা
        document.getElementById("sumTotalSales").textContent = "₹" + totalSales.toFixed(2);
        document.getElementById("sumTotalCollected").textContent = "₹" + totalCollected.toFixed(2);
        document.getElementById("sumTotalDue").textContent = "₹" + totalDue.toFixed(2);

        // Empty States
        if (!hasSales) salesTable.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px;">No sales data available.</td></tr>`;
        if (!hasDues) dueTable.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px; color:green; font-weight:bold;">Awesome! There are no pending dues.</td></tr>`;
        if (!hasMissed) missedTable.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 20px;">No missed books record found.</td></tr>`;
    }

    // ==========================================
    // 2. Stock Inventory Logic
    // ==========================================
    function processStockInventory(received, returns, sales) {
        let stockMap = new Map();

        // Older sales/returns may not contain writer or part. Resolve those
        // records against the single received book with the same name so they
        // do not appear as an extra stock row.
        function stockKey(record) {
            const writer = record.writer || "-";
            const part = record.part || "-";
            const exactKey = record.bookName + "|" + writer + "|" + part;
            const matchingKeys = [...stockMap.keys()].filter(key => key.startsWith(record.bookName + "|"));
            if (stockMap.has(exactKey) || matchingKeys.length !== 1) return exactKey;
            return matchingKeys[0];
        }

        // A. Process Received Data (+)
        received.forEach(rec => {
            let key = rec.bookName + "|" + (rec.writer || "-") + "|" + (rec.part || "-");
            if (!stockMap.has(key)) {
                stockMap.set(key, { name: rec.bookName, writer: rec.writer || "-", part: rec.part || "-", recQty: 0, retQty: 0, soldQty: 0 });
            }
            stockMap.get(key).recQty += parseFloat(rec.qty) || 0;
        });

        // B. Process Returned Data (-)
        returns.forEach(ret => {
            let key = stockKey(ret);
            if (stockMap.has(key)) {
                stockMap.get(key).retQty += parseFloat(ret.qty) || 0;
            }
        });

        // C. Process Sold Data (-)
        sales.forEach(sale => {
            let key = stockKey(sale);
            // যদি কোনো বই সরাসরি রিসিভ না করে বিক্রি করা হয় (ভুল করে), তাহলেও ম্যাপে যোগ করতে হবে
            if (!stockMap.has(key)) {
                stockMap.set(key, { name: sale.bookName, writer: sale.writer || "-", part: sale.part || "-", recQty: 0, retQty: 0, soldQty: 0 });
            }
            stockMap.get(key).soldQty += parseFloat(sale.qty) || 0;
        });

        const stockTable = document.getElementById("stockTableBody");
        stockTable.innerHTML = "";
        let hasStock = false;

        stockMap.forEach((data, key) => {
            hasStock = true;
            // Current Stock = Received - Returned - Sold
            let currentStock = data.recQty - data.retQty - data.soldQty;
            
            // Stock Warning Color Logic
            let stockColor = "black";
            if (currentStock <= 5 && currentStock > 0) stockColor = "#d97706"; // Low Stock (Warning)
            else if (currentStock <= 0) stockColor = "#ef4444"; // Out of Stock (Red)

            stockTable.innerHTML += `
                <tr>
                    <td style="font-weight:bold;">${data.name}</td>
                    <td style="font-style:italic;">${data.writer}</td>
                    <td>${data.part}</td>
                    <td style="color:#2563eb; font-weight:bold;">${data.recQty}</td>
                    <td style="color:#ef4444;">${data.retQty}</td>
                    <td style="color:#059669;">${data.soldQty}</td>
                    <td style="background-color: #ecfdf5; font-weight:bold; font-size:16px; color: ${stockColor};">
                        ${currentStock}
                    </td>
                </tr>
            `;
        });

        if (!hasStock) {
            stockTable.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px;">No inventory records found. Add received books first.</td></tr>`;
        }
    }
});
