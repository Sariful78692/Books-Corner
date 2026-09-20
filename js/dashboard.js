document.addEventListener("DOMContentLoaded", function() {
    const yearFilter = document.getElementById("yearFilter");
    const syncBtn = document.getElementById("syncBtn");
    const syncStatus = document.getElementById("syncStatus");

    const totalSalesEl = document.getElementById("totalSales");
    const monthSalesEl = document.getElementById("monthSales");
    const totalDuesEl = document.getElementById("totalDues");
    const totalPurchasesEl = document.getElementById("totalPurchases");
    const recentSalesBody = document.getElementById("recentSalesBody");
    const displayYearSpans = document.querySelectorAll(".display-year");

    let monthlyChartObj = null;
    let classChartObj = null;

    let currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 2023; y--) {
        yearFilter.innerHTML += `<option value="${y}">${y}</option>`;
    }
    
    yearFilter.addEventListener("change", function() {
        loadDashboardData(this.value);
    });

    // Auto Sync on Load
    function autoSyncData() {
        if (typeof scriptURL === 'undefined' || !scriptURL) {
            loadDashboardData(yearFilter.value);
            return;
        }

        syncStatus.textContent = "🔄 Syncing with cloud...";

        syncCloudData()
            .then(response => response.json())
            .then(data => {
                if(data) {
                    if(data.bookEntries) localStorage.setItem("bookEntries", JSON.stringify(data.bookEntries));
                    if(data.bookReceived) localStorage.setItem("bookReceived", JSON.stringify(data.bookReceived));
                    if(data.bookReturn) localStorage.setItem("bookReturn", JSON.stringify(data.bookReturn));
                    if(data.publisherPayments) localStorage.setItem("publisherPayments", JSON.stringify(data.publisherPayments));
                    if(data.classBooksMapping) localStorage.setItem("classBooksMapping", JSON.stringify(data.classBooksMapping));
                    if(data.bookSales) localStorage.setItem("bookSales", JSON.stringify(data.bookSales));
                    
                    syncStatus.textContent = "✅ Cloud data synced successfully!";
                    setTimeout(() => { syncStatus.textContent = "System is up to date"; }, 3000);
                }
                loadDashboardData(yearFilter.value);
            })
            .catch(error => {
                console.error("Auto Sync Error:", error);
                syncStatus.textContent = "⚠️ Offline Mode (Using local cache)";
                loadDashboardData(yearFilter.value);
            });
    }

    // Load Data & Render Cards
    function loadDashboardData(selectedYear) {
        displayYearSpans.forEach(span => span.textContent = selectedYear);

        let savedSales = JSON.parse(localStorage.getItem("bookSales")) || [];
        let savedReceived = JSON.parse(localStorage.getItem("bookReceived")) || [];
        
        let currentMonth = new Date().getMonth(); 
        let currentYearActual = new Date().getFullYear();

        let ySales = 0, mSales = 0, yDues = 0, yPurchases = 0;
        let invoiceMap = new Map();
        let monthlySales = Array(12).fill(0);
        let classSalesMap = {}; // Class wise sales tracking

        // Process Sales
        savedSales.forEach(sale => {
            let saleDate = new Date(sale.date);
            if (saleDate.getFullYear() == selectedYear) {
                let mIndex = saleDate.getMonth();
                let amt = parseFloat(sale.grandTotal) || 0;
                monthlySales[mIndex] += amt;

                // Class wise accumulation
                let cls = sale.class || "General";
                classSalesMap[cls] = (classSalesMap[cls] || 0) + amt;

                let inv = sale.invoiceNo;
                if (!invoiceMap.has(inv)) {
                    invoiceMap.set(inv, {
                        date: sale.date, customer: sale.customer, className: cls,
                        billAmount: 0, due: parseFloat(sale.due) || 0
                    });
                }
                invoiceMap.get(inv).billAmount += amt;
            }
        });

        let recentInvoices = [];
        invoiceMap.forEach((data, inv) => {
            ySales += data.billAmount;
            yDues += data.due;
            
            let sDate = new Date(data.date);
            if (sDate.getMonth() == currentMonth && sDate.getFullYear() == currentYearActual) {
                mSales += data.billAmount;
            }
            recentInvoices.push({ inv: inv, ...data });
        });

        // Process Purchases
        savedReceived.forEach(rec => {
            if (new Date(rec.date).getFullYear() == selectedYear) {
                yPurchases += parseFloat(rec.grandTotal) || (parseFloat(rec.qty) * parseFloat(rec.rate)) || 0;
            }
        });

        // Update Cards Metrics
        totalSalesEl.textContent = "₹" + ySales.toFixed(2);
        monthSalesEl.textContent = "₹" + mSales.toFixed(2);
        totalDuesEl.textContent = "₹" + yDues.toFixed(2);
        totalPurchasesEl.textContent = "₹" + yPurchases.toFixed(2);

        // Render Both Charts inside Cards
        renderMonthlyChart(monthlySales);
        renderClassChart(classSalesMap);

        // Load Table
        recentInvoices.sort((a, b) => new Date(b.date) - new Date(a.date));
        recentSalesBody.innerHTML = "";
        
        if (recentInvoices.length === 0) {
            recentSalesBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:gray;">No sales recorded in ${selectedYear}</td></tr>`;
        } else {
            recentInvoices.slice(0, 10).forEach(req => {
                let statusHtml = req.due > 0 ? `<span style="background:#fee2e2; color:#ef4444; padding:3px 8px; border-radius:4px; font-size:12px; font-weight:bold;">Due: ₹${req.due.toFixed(2)}</span>` 
                                             : `<span style="background:#d1fae5; color:#059669; padding:3px 8px; border-radius:4px; font-size:12px; font-weight:bold;">Paid</span>`;
                recentSalesBody.innerHTML += `
                    <tr>
                        <td>${req.date}</td>
                        <td style="color:#2563eb; font-weight:bold;">${req.inv}</td>
                        <td>${req.customer}</td>
                        <td>${req.className}</td>
                        <td style="text-align: right; font-weight:bold;">₹${req.billAmount.toFixed(2)}</td>
                        <td style="text-align: right;">${statusHtml}</td>
                    </tr>
                `;
            });
        }
    }

    // 1. Monthly Sales Bar Chart
    function renderMonthlyChart(dataArray) {
        const ctx = document.getElementById('monthlySalesChart').getContext('2d');
        if (monthlyChartObj) monthlyChartObj.destroy();

        monthlyChartObj = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                datasets: [{
                    label: 'Sales (₹)',
                    data: dataArray,
                    backgroundColor: 'rgba(59, 130, 246, 0.75)',
                    borderColor: 'rgba(29, 78, 216, 1)',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, grid: { color: '#f3f4f6' } }, x: { grid: { display: false } } },
                plugins: { legend: { display: false } }
            }
        });
    }

    // 2. Class Wise Donut Chart
    function renderClassChart(classMap) {
        const ctx = document.getElementById('classSalesChart').getContext('2d');
        if (classChartObj) classChartObj.destroy();

        let labels = Object.keys(classMap);
        let values = Object.values(classMap);

        if (labels.length === 0) {
            labels = ['No Data'];
            values = [1];
        }

        classChartObj = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
                }
            }
        });
    }

    syncBtn.addEventListener("click", autoSyncData);
    autoSyncData();
});
