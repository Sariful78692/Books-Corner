document.addEventListener("DOMContentLoaded", function() {
    const fromDateInput = document.getElementById("reportFromDate");
    const toDateInput = document.getElementById("reportToDate");
    const studentSearchInput = document.getElementById("reportStudentSearch");
    const studentSearchSummary = document.getElementById("studentSearchSummary");
    function applyStudentSearch() {
        const query = (studentSearchInput.value || "").trim().toLowerCase();
        let takenBooks = 0, missedBooks = 0, totalAmount = 0;
        document.querySelectorAll("#salesTableBody tr, #dueTableBody tr, #missedTableBody tr").forEach(row => {
            const matches = !query || row.textContent.toLowerCase().includes(query);
            row.style.display = matches ? "" : "none";
            if (matches && row.closest("#salesTableBody")) {
                const books = row.cells[4] ? row.cells[4].textContent.split(",").filter(Boolean) : [];
                takenBooks += books.length;
                totalAmount += parseFloat((row.cells[6]?.textContent || "").replace(/[^0-9.-]/g, "")) || 0;
            }
            if (matches && row.closest("#missedTableBody")) {
                missedBooks += row.querySelectorAll(".badge-danger").length;
            }
        });
        studentSearchSummary.textContent = query
            ? `Taken: ${takenBooks} | Missed: ${missedBooks} | Bill: ₹${totalAmount.toFixed(2)}`
            : "";
    }
    studentSearchInput.addEventListener("input", applyStudentSearch);
    studentSearchInput.addEventListener("keyup", applyStudentSearch);

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
    // Render cached data immediately. Cloud sync runs in the background so a
    // slow Google Apps Script response cannot keep the report blank/stuck.
    generateReports();
    syncCloudData()
        .then(() => generateReports())
        .catch(error => console.warn("Report sync failed; using cached data", error));

    function generateReports() {
        const savedReceived = JSON.parse(localStorage.getItem("bookReceived")) || [];
        const savedReturn = JSON.parse(localStorage.getItem("bookReturn")) || [];
        const savedSales = JSON.parse(localStorage.getItem("bookSales")) || [];
        const savedMissedBooks = JSON.parse(localStorage.getItem("missedBooks")) || [];
        processSalesAndDues(savedSales.filter(item => inDateRange(item.date)), savedMissedBooks.filter(item => inDateRange(item.date)));
        processStockInventory(
            savedReceived.filter(item => inDateRange(item.date)),
            savedReturn.filter(item => inDateRange(item.date)),
            savedSales.filter(item => inDateRange(item.date))
        );
    }

    // ==========================================
    // 1. Sales History, Due List & Missed Books Logic
    // ==========================================
    function processSalesAndDues(salesData, missedBookData) {
        let invoiceMap = new Map();
        const receivedBooks = JSON.parse(localStorage.getItem("bookReceived")) || [];
        function getPublisher(bookName, writer, part) {
            const match = receivedBooks.find(book => book.bookName === bookName &&
                (book.writer || "-") === (writer || "-") && (book.part || "-") === (part || "-"));
            return match ? (match.publisher || "-") : "-";
        }
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
                    missedBooks: []
                });
            }
            const invoice = invoiceMap.get(inv);
            invoice.billAmount += parseFloat(sale.grandTotal) || 0;
            invoice.bookRows = invoice.bookRows || [];
            invoice.bookRows.push(sale);
        });

        const classBooks = JSON.parse(localStorage.getItem("classBooksMapping")) || [];
        invoiceMap.forEach((invoice, inv) => {
            const invoiceRows = salesData.filter(sale => sale.invoiceNo === inv);
            // Include later purchases by the same student/class. If a student
            // buys a previously missed book later, it must disappear from Missed.
            const customerSales = salesData.filter(sale =>
                sale.customer === invoice.customer && sale.class === invoice.className
            );
            const soldIds = new Set(customerSales.map(sale => [sale.bookName, sale.writer || "-", sale.part || "-"].join("|")));
            const soldNames = new Set(customerSales.map(sale => sale.bookName));
            const assignedIds = new Set();
            const assignedBooks = classBooks.filter(book => book.className === invoice.className)
                .filter(book => {
                    const id = [book.bookName, book.writer || "-", book.part || "-"].join("|");
                    if (assignedIds.has(id)) return false;
                    assignedIds.add(id);
                    return true;
                });
            const assignedNames = new Set(assignedBooks.map(book => book.bookName));
            // Database rows are accepted only when they are still assigned and
            // were not sold in this invoice. This removes old/stale missed rows.
            const databaseMissed = missedBookData
                .filter(book => book.invoiceNo === inv && assignedNames.has(book.bookName))
                .map(book => book.bookName)
                .filter(bookName => !soldNames.has(bookName));
            const calculatedMissed = assignedBooks
                .filter(book => !soldNames.has(book.bookName) && !soldIds.has([book.bookName, book.writer || "-", book.part || "-"].join("|")))
                .map(book => book.bookName);
            invoice.missedBooks = [...new Set([...databaseMissed, ...calculatedMissed])];
            invoice.bookNames = [...new Set(invoiceRows.map(book => book.bookName))].join(", ");
            invoice.publishers = [...new Set(invoiceRows.map(book =>
                book.publisher || getPublisher(book.bookName, book.writer, book.part)
            ))].filter(Boolean).join(", ");
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
                    <td>${data.bookNames || "-"}</td>
                    <td>${data.publishers || "-"}</td>
                    <td style="font-weight:bold;">₹${data.billAmount.toFixed(2)}</td>
                    <td style="color:#059669; font-weight:bold;">₹${data.paid.toFixed(2)}</td>
                    <td>${statusBadge} <button type="button" class="row-print-btn" data-invoice="${inv}" style="margin-left:6px; padding:3px 7px; cursor:pointer;">Print</button></td>
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
        if (!hasSales) salesTable.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 20px;">No sales data available.</td></tr>`;
        if (!hasDues) dueTable.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px; color:green; font-weight:bold;">Awesome! There are no pending dues.</td></tr>`;
        if (!hasMissed) missedTable.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 20px;">No missed books record found.</td></tr>`;
        applyStudentSearch();
        salesTable.querySelectorAll(".row-print-btn").forEach(button => {
            button.addEventListener("click", () => printInvoiceCompact(button.dataset.invoice, salesData));
        });
    }

    function printInvoice(invoiceNo, salesData) {
        const rows = salesData.filter(sale => sale.invoiceNo === invoiceNo);
        const popup = window.open("", "_blank", "width=800,height=600");
        if (!popup) return alert("Please allow pop-ups to print the invoice.");
        popup.document.write(`<html><head><title>Invoice ${invoiceNo}</title><style>@page{size:A5 portrait;margin:8mm}body{font-family:Arial;font-size:11px}h2{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:5px;text-align:left}th{background:#eee}</style></head><body><h2>BOOK'S CORNER</h2><p>Invoice: <b>${invoiceNo}</b> &nbsp; Date: <b>${rows[0]?.date || "-"}</b></p><p>Student: <b>${rows[0]?.customer || "-"}</b> &nbsp; Class: <b>${rows[0]?.class || "-"}</b></p><table><thead><tr><th>Book</th><th>Writer</th><th>Part</th><th>Qty</th><th>Total</th></tr></thead><tbody>${rows.map(row => `<tr><td>${row.bookName}</td><td>${row.writer || "-"}</td><td>${row.part || "-"}</td><td>${row.qty}</td><td>₹${parseFloat(row.grandTotal || 0).toFixed(2)}</td></tr>`).join("")}</tbody></table><script>window.onload=()=>window.print();<\/script></body></html>`);
        popup.document.close();
    }

    function printInvoiceCompact(invoiceNo, salesData) {
        const rows = salesData.filter(sale => sale.invoiceNo === invoiceNo);
        const popup = window.open("", "_blank", "width=800,height=600");
        if (!popup) return alert("Please allow pop-ups to print the invoice.");
        const items = rows.map(row => `<tr><td>${row.bookName}</td><td>${row.writer || "-"}</td><td>${row.part || "-"}</td><td>${row.qty}</td><td>₹${parseFloat(row.grandTotal || 0).toFixed(2)}</td></tr>`).join("");
        popup.document.write(`<html><head><title>Invoice ${invoiceNo}</title><style>@page{size:A5 portrait;margin:7mm}body{font-family:Arial;font-size:9px;color:#000;margin:0;min-height:calc(100vh - 14mm);display:flex;flex-direction:column}.header{text-align:center;border-bottom:1px solid #000;padding-bottom:6px;margin-bottom:9px}.header h2{font-size:18px;margin:0 0 3px}.header p{font-size:8px;margin:2px 0}.info{display:flex;justify-content:space-between;font-size:9px;margin-bottom:9px}table{width:100%;border-collapse:collapse;font-size:8px}th,td{border:1px solid #000;padding:3px;text-align:left}th{background:#eee}.signature{margin-top:auto;margin-left:auto;width:145px;border-top:1px solid #000;text-align:center;padding-top:4px;font-size:9px}</style></head><body><div class="header"><h2>BOOK'S CORNER</h2><p>Run By:- Children's Corner</p><p>Address:- Vill- Sangrampur, PO- Kalikapota, PS- Usthi, Dist- South 24 Parganas, PIN- 743355</p><p>Website: www.childrenscorner.in | E-mail: childrenscorner85@gmail.com</p></div><div class="info"><div>Invoice: <b>${invoiceNo}</b><br>Student: <b>${rows[0]?.customer || "-"}</b></div><div>Date: <b>${rows[0]?.date || "-"}</b><br>Class: <b>${rows[0]?.class || "-"}</b></div></div><table><thead><tr><th>Book</th><th>Writer</th><th>Part</th><th>Qty</th><th>Total</th></tr></thead><tbody>${items}</tbody></table><div class="signature">Authorize Signature</div><script>window.onload=()=>window.print();<\/script></body></html>`);
        popup.document.close();
    }

    // Keep the report fresh when rows are manually added/deleted in Google Sheets.
    setInterval(() => {
        syncCloudData()
            .then(() => generateReports())
            .catch(error => console.warn("Automatic report refresh failed", error));
    }, 5000);

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
