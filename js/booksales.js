document.addEventListener("DOMContentLoaded", function() {
    const customerNameInput = document.getElementById("customerName");
    const customerMobileInput = document.getElementById("customerMobile");
    const customerAddressInput = document.getElementById("customerAddress");
    const classSelect = document.getElementById("classSelect");
    const salesDateInput = document.getElementById("salesDate");
    const salesListSection = document.getElementById("salesListSection");
    const salesListBody = document.getElementById("salesListBody");
    const displayClassName = document.getElementById("displayClassName");
    const submitSalesBtn = document.getElementById("submitSalesBtn");
    
    const overallDiscountPctInput = document.getElementById("overallDiscountPct"); 
    const overallDiscountInput = document.getElementById("overallDiscount"); 
    const paidAmountInput = document.getElementById("paidAmount");
    const dueAmountDisplay = document.getElementById("dueAmount");

    const todayStr = new Date().toISOString().split('T')[0];
    if (salesDateInput) salesDateInput.value = todayStr;

    function loadClasses() {
        let savedClasses = JSON.parse(localStorage.getItem("schoolClasses")) || [];
        classSelect.innerHTML = '<option value="">-- Choose Class --</option>';
        savedClasses.forEach(cls => { classSelect.innerHTML += `<option value="${cls}">${cls}</option>`; });
    }
    loadClasses();

    // ⚠️ Stock বের করার ফাংশন
    function getBookStock(bName, bWriter, bPart) {
        let savedReceived = JSON.parse(localStorage.getItem("bookReceived")) || [];
        let savedReturn = JSON.parse(localStorage.getItem("bookReturn")) || [];
        let savedSales = JSON.parse(localStorage.getItem("bookSales")) || [];
        
        let rec = 0, ret = 0, sold = 0;
        savedReceived.forEach(r => { if(r.bookName === bName && (r.writer||"-") === bWriter && (r.part||"-") === bPart) rec += parseFloat(r.qty)||0; });
        savedReturn.forEach(r => { if(r.bookName === bName && (r.writer||"-") === bWriter && (r.part||"-") === bPart) ret += parseFloat(r.qty)||0; });
        savedSales.forEach(s => { if(s.bookName === bName && (s.writer||"-") === bWriter && (s.part||"-") === bPart) sold += parseFloat(s.qty)||0; });
        
        return rec - ret - sold;
    }

    classSelect.addEventListener("change", function() {
        let className = this.value;
        if (!className) { salesListSection.style.display = "none"; return; }
        
        overallDiscountPctInput.value = ""; overallDiscountInput.value = 0; 
        paidAmountInput.value = ""; dueAmountDisplay.textContent = "₹0.00";
        displayClassName.textContent = className;
        loadClassBooksForSale(className);
        salesListSection.style.display = "block";
    });

    function loadClassBooksForSale(className) {
        let mappedClassBooks = JSON.parse(localStorage.getItem("classBooksMapping")) || [];
        let thisClassBooks = mappedClassBooks.filter(m => m.className === className);
        
        salesListBody.innerHTML = "";
        
        if(thisClassBooks.length === 0){
            salesListBody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:red; padding:20px;">No books assigned to this class yet.</td></tr>`;
            calculateGrandTotals(); return;
        }

        thisClassBooks.forEach((book) => {
            let rate = parseFloat(book.price) || 0;
            let currentStock = getBookStock(book.bookName, book.writer, book.part);
            
            let isStockAvailable = currentStock > 0;
            let qty = isStockAvailable ? 1 : 0; 
            let amt = rate * qty;
            
            let stockColor = isStockAvailable ? "#059669" : "#ef4444";
            let rowClass = isStockAvailable ? "book-row" : "book-row out-of-stock";
            
            salesListBody.innerHTML += `
                <tr class="${rowClass}">
                    <td style="text-align:center;">
                        <input type="checkbox" class="book-check" ${isStockAvailable ? 'checked' : 'disabled'} data-name="${book.bookName}">
                    </td>
                    <td class="b-name" style="font-weight:bold;">${book.bookName}</td>
                    <td class="b-writer" style="font-style:italic;">${book.writer}</td>
                    <td class="b-part">${book.part}</td>
                    
                    <td style="font-weight:bold; color:${stockColor}; background:#fef3c7;">${currentStock}</td>
                    
                    <td><input type="number" class="s-input s-rate" value="${rate}" step="0.01" ${!isStockAvailable ? 'disabled' : ''}></td>
                    <td><input type="number" class="s-input s-qty" value="${qty}" min="1" max="${currentStock}" ${!isStockAvailable ? 'disabled' : ''}></td>
                    <td class="b-amount" style="font-weight:bold;">${amt.toFixed(2)}</td>
                    <td><input type="number" class="s-input s-dis" value="0" step="0.01" style="width:50px;" ${!isStockAvailable ? 'disabled' : ''}></td>
                    <td class="b-grand" style="font-weight:bold; color:#059669;">${amt.toFixed(2)}</td>
                </tr>
            `;
        });

        attachRowEvents();
        calculateGrandTotals();
    }

    function attachRowEvents() {
        const rows = document.querySelectorAll(".book-row");
        rows.forEach(row => {
            const checkbox = row.querySelector(".book-check");
            const inputs = row.querySelectorAll("input[type='number']");
            
            if(checkbox) {
                checkbox.addEventListener("change", function() {
                    inputs.forEach(input => input.disabled = !this.checked);
                    calculateGrandTotals();
                });
            }

            inputs.forEach(input => input.addEventListener("input", function() {
                // ⚠️ Stock Validation
                if(this.classList.contains("s-qty")) {
                    let maxStock = parseFloat(this.getAttribute("max")) || 0;
                    if(parseFloat(this.value) > maxStock) {
                        alert(`Not enough stock! Only ${maxStock} pcs available.`);
                        this.value = maxStock;
                    }
                }
                calculateRow(row);
                calculateGrandTotals();
            }));
        });
    }

    overallDiscountPctInput.addEventListener("input", calculateGrandTotals);
    overallDiscountInput.addEventListener("input", calculateGrandTotals);
    paidAmountInput.addEventListener("input", calculateGrandTotals); 

    function calculateRow(row) {
        let qty = parseFloat(row.querySelector(".s-qty").value) || 0;
        let rate = parseFloat(row.querySelector(".s-rate").value) || 0;
        let dis = parseFloat(row.querySelector(".s-dis").value) || 0;
        
        let amount = qty * rate;
        let grand = amount - (amount * dis / 100);
        
        row.querySelector(".b-amount").textContent = amount.toFixed(2);
        row.querySelector(".b-grand").textContent = grand.toFixed(2);
    }

    function calculateGrandTotals() {
        let tQty = 0, tAmt = 0, itemGrandTotal = 0;
        
        document.querySelectorAll(".book-row").forEach(row => {
            let chk = row.querySelector(".book-check");
            if (chk && chk.checked) {
                let qty = parseFloat(row.querySelector(".s-qty").value) || 0;
                let amt = parseFloat(row.querySelector(".b-amount").textContent) || 0;
                let grand = parseFloat(row.querySelector(".b-grand").textContent) || 0;
                
                tQty += qty; tAmt += amt; itemGrandTotal += grand;
            }
        });
        
        if (document.activeElement === overallDiscountInput) overallDiscountPctInput.value = "";
        else if (overallDiscountPctInput.value !== "") {
            let pct = parseFloat(overallDiscountPctInput.value) || 0;
            let calcFlat = (itemGrandTotal * pct / 100);
            overallDiscountInput.value = calcFlat > 0 ? calcFlat.toFixed(2) : 0;
        }

        let overAllDisc = parseFloat(overallDiscountInput.value) || 0;
        if (overAllDisc > itemGrandTotal) { overAllDisc = itemGrandTotal; overallDiscountInput.value = overAllDisc; }

        let netGrand = itemGrandTotal - overAllDisc;
        
        document.getElementById("totQty").textContent = tQty;
        document.getElementById("totAmount").textContent = "₹" + tAmt.toFixed(2);
        document.getElementById("totDiscount").textContent = "₹" + (tAmt - itemGrandTotal).toFixed(2);
        document.getElementById("totGrand").textContent = "₹" + netGrand.toFixed(2);

        let paid = parseFloat(paidAmountInput.value) || 0;
        if (paid > netGrand) { paid = netGrand; paidAmountInput.value = paid; }
        
        dueAmountDisplay.textContent = "₹" + (netGrand - paid).toFixed(2);
    }

    // Invoice Print Logic
    function printSalesInvoice(invoiceData) {
        let oldFrame = document.getElementById("printFrame");
        if (oldFrame) oldFrame.remove();

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
            <title>Sales Invoice - BOOK'S CORNER</title>
            <style>
                @page { size: A4; margin: 20px; }
                body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #000; display: flex; flex-direction: column; min-height: 95vh; }
                .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
                .header h1 { font-size: 34px; margin: 0; font-weight: bold; letter-spacing: 1px; }
                .header h3 { font-size: 18px; margin: 8px 0; font-weight: normal; }
                .header p { font-size: 14px; margin: 4px 0; }
                .info-bar { margin-bottom: 20px; display: flex; justify-content: space-between; font-size: 15px; font-weight: bold;}
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
                th, td { border: 1px solid #000; padding: 8px 10px; text-align: left; }
                th { background-color: #f3f4f6 !important; -webkit-print-color-adjust: exact; }
                .totals { text-align: right; margin-bottom: 20px; font-size: 15px; }
                .totals p { margin: 6px 0; }
                .grand-total { font-size: 20px; font-weight: bold; margin-top: 10px; padding-top: 10px; border-top: 1px solid #000; display: inline-block; }
                .payment-info { margin-top: 5px; font-size: 16px; font-weight: bold; color: #333; }
                .footer { display: flex; justify-content: flex-end; margin-top: auto; padding-top: 50px; }
                .signature { border-top: 1px solid #000; padding-top: 8px; width: 300px; text-align: center; font-weight: bold; font-size: 14px; }
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
                <div>
                    <div>Invoice No: <strong>${invoiceData.invoiceNo}</strong></div>
                    <div style="margin-top: 5px;">Customer Name: <strong>${invoiceData.customer}</strong></div>
                    ${invoiceData.mobile !== '-' ? `<div style="margin-top: 5px;">Mobile: <strong>${invoiceData.mobile}</strong></div>` : ''}
                    ${invoiceData.address !== '-' ? `<div style="margin-top: 5px;">Address: <strong>${invoiceData.address}</strong></div>` : ''}
                </div>
                <div style="text-align: right;">
                    <div>Date: <strong>${invoiceData.date}</strong></div>
                    <div style="margin-top: 5px;">Class: <strong>${invoiceData.className}</strong></div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Sl</th><th>Book Name</th><th>Writer</th><th>Part</th>
                        <th>Rate</th><th>Qty</th><th>Amount</th><th>Dis %</th><th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${invoiceData.rowsHtml}
                </tbody>
            </table>

            <div class="totals">
                <p>Total Books: <strong>${invoiceData.tQty} pcs</strong></p>
                <p>Sub Total: <strong>₹${invoiceData.tAmt}</strong></p>
                <p>Item Discount: <strong>₹${invoiceData.tDis}</strong></p>
                ${parseFloat(invoiceData.addDisAmt) > 0 ? `<p style="color:red;">Additional Discount: <strong>- ₹${invoiceData.addDisAmt}</strong></p>` : ''}
                
                <div class="grand-total">Net Payable: ₹${invoiceData.tGrand}</div>
                
                <div class="payment-info" style="margin-top: 15px;">Paid Amount: <span style="font-size: 18px;">₹${invoiceData.tPaid}</span></div>
                <div class="payment-info" style="color: #d93025;">Due Amount: <span style="font-size: 18px;">₹${invoiceData.tDue}</span></div>
            </div>

            <div class="footer">
                <div class="signature">Authorize Signature</div>
            </div>
        </body>
        </html>
        `;
        
        let frameDoc = printFrame.contentWindow.document;
        frameDoc.open();
        frameDoc.write(receiptHTML);
        frameDoc.close();
        
        setTimeout(() => { printFrame.contentWindow.focus(); printFrame.contentWindow.print(); }, 500);
    }

    submitSalesBtn.addEventListener("click", function() {
        let customerName = customerNameInput.value.trim();
        let customerMobile = customerMobileInput.value.trim() || "-";
        let customerAddress = customerAddressInput.value.trim() || "-";
        let className = classSelect.value;
        let today = salesDateInput.value;

        if (!customerName) return alert("Please enter Customer Name!");
        if (!className) return alert("Please select a Class!");

        let selectedRows = [...document.querySelectorAll(".book-row")].filter(row => row.querySelector(".book-check") && row.querySelector(".book-check").checked);
        if (selectedRows.length === 0) return alert("Please select at least one book to sell.");

        let paidAmtStr = paidAmountInput.value;
        if (paidAmtStr === "") return alert("Please enter Paid Amount (Enter 0 if fully due).");
        
        let invoiceNo = "INV-" + Date.now().toString().slice(-6);
        let savedSales = JSON.parse(localStorage.getItem("bookSales")) || [];
        
        let printRowsHtml = ""; let printSl = 1;
        let totalQty = 0, totalAmt = 0, itemGrandTotal = 0;

        let allBooksInClass = [...document.querySelectorAll(".book-check")].map(chk => chk.getAttribute("data-name"));
        let soldBooks = selectedRows.map(row => row.querySelector(".b-name").textContent);
        let missedBooks = allBooksInClass.filter(b => !soldBooks.includes(b)); 

        selectedRows.forEach(row => {
            totalQty += parseFloat(row.querySelector(".s-qty").value) || 0;
            totalAmt += parseFloat(row.querySelector(".b-amount").textContent) || 0;
            itemGrandTotal += parseFloat(row.querySelector(".b-grand").textContent) || 0;
        });

        let overAllDiscAmt = parseFloat(overallDiscountInput.value) || 0;
        let netGrandTotal = itemGrandTotal - overAllDiscAmt;
        let paidAmount = parseFloat(paidAmountInput.value) || 0;
        let dueAmount = netGrandTotal - paidAmount;

        submitSalesBtn.textContent = "Processing..."; submitSalesBtn.disabled = true;

        selectedRows.forEach((row, idx) => {
            let bName = row.querySelector(".b-name").textContent;
            let bWriter = row.querySelector(".b-writer").textContent;
            let bPart = row.querySelector(".b-part").textContent;
            let rate = row.querySelector(".s-rate").value;
            let qty = row.querySelector(".s-qty").value;
            let amt = row.querySelector(".b-amount").textContent;
            let dis = row.querySelector(".s-dis").value || 0;
            let grand = parseFloat(row.querySelector(".b-grand").textContent) || 0;

            let distributedGrand = grand;
            if (itemGrandTotal > 0 && overAllDiscAmt > 0) distributedGrand = grand - ((grand / itemGrandTotal) * overAllDiscAmt);

            let rowPaid = idx === 0 ? paidAmount : 0;
            let rowDue = idx === 0 ? dueAmount : 0;

            printRowsHtml += `<tr>
                <td>${printSl++}</td><td>${bName}</td><td>${bWriter}</td><td>${bPart}</td>
                <td>₹${rate}</td><td>${qty}</td><td>₹${amt}</td><td>${dis}%</td>
                <td style="font-weight:bold;">₹${grand.toFixed(2)}</td>
            </tr>`;

            const requestData = { sheetName: "BookSales", rowData: [today, invoiceNo, customerName, customerMobile, customerAddress, className, bName, qty, rate, amt, dis, distributedGrand.toFixed(2), rowPaid, rowDue] };

            savedSales.push({ 
                date: today, invoiceNo: invoiceNo, customer: customerName, mobile: customerMobile, address: customerAddress, class: className, 
                bookName: bName, writer: bWriter, part: bPart, qty: qty, rate: rate, amount: amt, discount: dis, grandTotal: distributedGrand.toFixed(2),
                paid: rowPaid, due: rowDue, missedBooks: (idx === 0 ? missedBooks : []) 
            });

            if(typeof scriptURL !== 'undefined') fetch(scriptURL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestData) });
        });

        localStorage.setItem("bookSales", JSON.stringify(savedSales));
        
        let invoiceData = {
            invoiceNo: invoiceNo, date: today, customer: customerName, mobile: customerMobile, address: customerAddress, className: className,
            rowsHtml: printRowsHtml, tQty: totalQty, tAmt: totalAmt.toFixed(2), tDis: (totalAmt - itemGrandTotal).toFixed(2), 
            addDisAmt: overAllDiscAmt.toFixed(2), tGrand: netGrandTotal.toFixed(2), tPaid: paidAmount.toFixed(2), tDue: dueAmount.toFixed(2)
        };

        alert("Sale successful! Generating Invoice...");
        printSalesInvoice(invoiceData);
        
        customerNameInput.value = ""; customerMobileInput.value = ""; customerAddressInput.value = "";
        classSelect.value = ""; overallDiscountPctInput.value = ""; overallDiscountInput.value = 0;
        paidAmountInput.value = ""; dueAmountDisplay.textContent = "₹0.00";
        salesListSection.style.display = "none";
        
        submitSalesBtn.textContent = "🖨️ Submit Sale & Print Bill"; submitSalesBtn.disabled = false;
    });
});
