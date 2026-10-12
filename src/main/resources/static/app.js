const $ = (id) => document.getElementById(id);
let csrfHeader = "X-XSRF-TOKEN";
let csrfToken = "";
let invoices = [];
let businessProfile = {};

async function refreshCsrf() {
  const res = await fetch("/api/csrf", { credentials: "same-origin" });
  if (!res.ok) throw new Error("Could not initialize secure session.");
  const data = await res.json();
  csrfHeader = data.headerName;
  csrfToken = data.token;
}

async function api(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = { ...(options.headers || {}) };

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    await refreshCsrf();
    headers[csrfHeader] = csrfToken;
  }

  const res = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: "same-origin"
  });

  if (res.status === 204) return null;

  const contentType = res.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
      ? await res.json()
      : null;

  if (!res.ok) {
    throw new Error(
        body?.detail ||
        body?.message ||
        body?.error ||
        `Request failed (${res.status})`
    );
  }

  return body;
}

function money(n) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(n || 0));
}
function message(id, text, ok = false) {
  $(id).textContent = text;
  $(id).style.color = ok ? "#146c3b" : "#a32b2b";
}
function showAuth(register = false) {
  $("auth").hidden = false; $("app").hidden = true;
  $("loginForm").hidden = register; $("registerForm").hidden = !register;
  $("showLogin").classList.toggle("active", !register);
  $("showRegister").classList.toggle("active", register);
  message("authMessage", "");
}
async function loadApp() {
  try {
    const me = await api("/api/auth/me")
    businessProfile = me;
    $("auth").hidden = true; $("app").hidden = false;
    $("businessTitle").textContent = me.businessName;
    $("businessMeta").textContent = `${me.email} · ${me.industry.replaceAll("-", " ")}`;
    await loadInvoices();
  } catch (error) {
    console.error("Dashboard load failed:", error);
    showAuth(false);
  }
}
async function loadInvoices() {
  invoices = await api("/api/invoices");
  const summary = await api("/api/invoices/summary");
  $("count").textContent = summary.invoiceCount;
  $("invoiced").textContent = money(summary.totalInvoiced);
  $("paid").textContent = money(summary.totalPaid);
  $("outstanding").textContent = money(summary.outstanding);
  $("overdue").textContent = summary.overdueCount;

  renderInvoices();
  updateSmartDashboard();
  renderCharts();
}


function renderInvoices() {
  const query = $("search").value.trim().toLowerCase();
  const rows = invoices.filter(i =>
      `${i.invoiceNumber} ${i.customerName} ${i.status}`
          .toLowerCase()
          .includes(query)
  );

  $("invoiceRows").replaceChildren();

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 10;
    td.textContent = invoices.length
        ? "No invoices match your search."
        : "No invoices yet. Create your first invoice above.";
    tr.append(td);
    $("invoiceRows").append(tr);
    return;
  }

  for (const i of rows) {
    const tr = document.createElement("tr");

    const values = [
      i.invoiceNumber,
      i.customerName,
      money(i.totalAmount),
      money(i.paidAmount),
      money(i.balance),
      i.dueDate,
      `${i.riskScore ?? 0}/100`,
      i.riskLevel ?? "N/A"
    ];

    for (const value of values) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    }

    const statusTd = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = `status ${i.status}`;
    pill.textContent = i.status.replaceAll("_", " ");
    statusTd.append(pill);
    tr.append(statusTd);

    const actions = document.createElement("td");

    const printBtn = document.createElement("button");
    printBtn.textContent = "Print Invoice";
    printBtn.addEventListener("click", () => printInvoice(i));
    actions.append(printBtn);

    if (Number(i.balance) > 0) {
      const pay = document.createElement("button");
      pay.textContent = "Record payment";
      pay.addEventListener("click", () => recordPayment(i));
      actions.append(pay);
    }

    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => cancelInvoice(i));
    actions.append(cancel);

    tr.append(actions);
    $("invoiceRows").append(tr);
  }
}

function updateSmartDashboard() {
  const today = new Date().toLocaleDateString("en-CA");

  const todaySales = invoices
      .filter(i => i.issueDate === today)
      .reduce((sum, i) => sum + Number(i.totalAmount || 0), 0);

  const customerDues = invoices
      .reduce((sum, i) => sum + Number(i.balance || 0), 0);

  const overdueInvoices = invoices.filter(i =>
      Number(i.balance || 0) > 0 &&
      i.dueDate &&
      i.dueDate < today
  ).length;

  if ($("todaySales")) $("todaySales").textContent = money(todaySales);
  if ($("customerDues")) $("customerDues").textContent = money(customerDues);
  if ($("overdueInvoices")) $("overdueInvoices").textContent = String(overdueInvoices);
  if ($("estimatedProfit")) $("estimatedProfit").textContent = "Not available";
  renderMonthlyRevenueChart();
  // ===== REVENUE & COLLECTIONS =====

  const revenueTotal = invoices.reduce(
      (sum, i) => sum + Number(i.totalAmount || 0), 0
  );

  const revenueCollected = invoices.reduce(
      (sum, i) => sum + Number(i.paidAmount || 0), 0
  );

  const collectionRate = revenueTotal > 0
      ? Math.min(100, Math.max(0, (revenueCollected / revenueTotal) * 100))
      : 0;

  if ($("revenueTotal")) {
    $("revenueTotal").textContent = money(revenueTotal);
  }

  if ($("revenueCollected")) {
    $("revenueCollected").textContent = money(revenueCollected);
  }

  if ($("collectionRate")) {
    $("collectionRate").textContent = collectionRate.toFixed(1) + "%";
  }

  // ===== SMART PRO COLLECTION HEALTH =====

  const healthBadge = $("collectionHealthBadge");
  const healthMessage = $("collectionHealthMessage");

  if (healthBadge && healthMessage) {
    healthBadge.classList.remove(
        "healthExcellent",
        "healthModerate",
        "healthLow"
    );

    if (revenueTotal <= 0) {
      healthBadge.textContent = "No Data";
      healthMessage.textContent =
          "Create invoices to start tracking collection performance.";
    } else if (collectionRate >= 80) {
      healthBadge.textContent = "Excellent";
      healthBadge.classList.add("healthExcellent");

      healthMessage.textContent =
          "80% or more of your invoiced amount has been collected.";
    } else if (collectionRate >= 50) {
      healthBadge.textContent = "Moderate";
      healthBadge.classList.add("healthModerate");

      healthMessage.textContent =
          "50% to 79.9% of your invoiced amount has been collected.";
    } else {
      healthBadge.textContent = "Needs Attention";
      healthBadge.classList.add("healthLow");

      healthMessage.textContent =
          "Less than 50% of your invoiced amount has been collected. Review outstanding payments.";
    }
  }
  if ($("collectionProgressBar")) {
    $("collectionProgressBar").style.width = collectionRate + "%";
  }

  if ($("collectionSummary")) {
    $("collectionSummary").textContent =
        `${collectionRate.toFixed(1)}% of your total invoiced amount has been collected.`;
  }
  updatePaymentPriorities();
  // ===== SMART PRO PAYMENT ALERTS =====

// Count overdue invoices
  const alertOverdue = invoices.filter(i =>
      Number(i.balance || 0) > 0 &&
      i.dueDate &&
      i.dueDate < today
  ).length;

// Calculate the date 7 days from today
  const sevenDaysLater = new Date();
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

  const futureDate = [
    sevenDaysLater.getFullYear(),
    String(sevenDaysLater.getMonth() + 1).padStart(2, "0"),
    String(sevenDaysLater.getDate()).padStart(2, "0")
  ].join("-");

// Count unpaid invoices due within the next 7 days
  const alertDueSoon = invoices.filter(i =>
      Number(i.balance || 0) > 0 &&
      i.dueDate &&
      i.dueDate >= today &&
      i.dueDate <= futureDate
  ).length;

// Total outstanding amount
  const alertOutstanding = invoices.reduce(
      (sum, i) => sum + Math.max(0, Number(i.balance || 0)),
      0
  );

// Update dashboard alert cards
  if ($("alertOverdue")) {
    $("alertOverdue").textContent = String(alertOverdue);
  }

  if ($("alertDueSoon")) {
    $("alertDueSoon").textContent = String(alertDueSoon);
  }

  if ($("alertOutstanding")) {
    $("alertOutstanding").textContent = money(alertOutstanding);
  }
  // ===== SMART PRO PAYMENT PRIORITIES =====

  function updatePaymentPriorities() {
    const tbody = document.getElementById("paymentPriorityRows");
    if (!tbody) return;

    const today = new Date().toLocaleDateString("en-CA");

    const unpaid = invoices
        .filter(i => Number(i.balance || 0) > 0)
        .sort((a, b) => {
          const aDate = a.dueDate || "9999-12-31";
          const bDate = b.dueDate || "9999-12-31";
          return aDate.localeCompare(bDate);
        })
        .slice(0, 10);

    tbody.replaceChildren();

    if (unpaid.length === 0) {
      const row = tbody.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 5;
      cell.textContent = "No outstanding invoices.";
      return;
    }

    unpaid.forEach(invoice => {
      const balance = Number(invoice.balance || 0);
      const dueDate = invoice.dueDate || "";

      let priority = "Normal";

      if (dueDate && dueDate < today) {
        priority = "High - Overdue";
      } else if (dueDate) {
        const daysLeft = Math.round(
            (new Date(dueDate + "T00:00:00") -
                new Date(today + "T00:00:00")) / 86400000
        );

        if (daysLeft <= 7) {
          priority = "Medium - Due Soon";
        }
      }

      const row = tbody.insertRow();

      [
        invoice.customerName || "Unknown",
        invoice.invoiceNumber || "-",
        money(balance),
        dueDate || "-",
        priority
      ].forEach((value, index) => {
        const cell = row.insertCell();

        if (index === 4) {
          const badge = document.createElement("span");
          badge.textContent = value;
          badge.className = "priorityBadge";

          if (value.startsWith("High")) {
            badge.classList.add("priorityHigh");
          } else if (value.startsWith("Medium")) {
            badge.classList.add("priorityMedium");
          } else {
            badge.classList.add("priorityNormal");
          }

          cell.appendChild(badge);
        } else {
          cell.textContent = value;
        }
      });
    });
  }

// Display an alert summary
  if ($("smartAlertMessage")) {
    if (alertOverdue > 0) {
      $("smartAlertMessage").textContent =
          `${alertOverdue} overdue invoice(s) require attention.`;
    } else if (alertDueSoon > 0) {
      $("smartAlertMessage").textContent =
          `${alertDueSoon} invoice(s) are due within 7 days.`;
    } else {
      $("smartAlertMessage").textContent =
          "No overdue or upcoming payments require attention.";
    }
  }
}

async function recordPayment(invoice) {
  const raw = prompt(
      `Outstanding balance: ${money(invoice.balance)}\nEnter payment amount (₹):`
  );

  if (raw === null) return;

  const amount = Number(raw);

  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Enter a valid amount greater than zero.");
    return;
  }

  try {
    await api(`/api/invoices/${invoice.id}/payments`, {
      method: "POST",
      body: JSON.stringify({ amount })
    });
    await loadInvoices();
  } catch (e) {
    alert(e.message);
  }
}

async function cancelInvoice(invoice) {
  if (!confirm(
      `Cancel invoice ${invoice.invoiceNumber}? This cannot be undone from this screen.`
  )) return;

  try {
    await api(`/api/invoices/${invoice.id}`, { method: "DELETE" });
    await loadInvoices();
  } catch (e) {
    alert(e.message);
  }
}

function printInvoice(invoice) {
  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    alert("Please allow pop-ups to print the invoice.");
    return;
  }

  const escapeHtml = value =>
      String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]);

  const invoiceNumber = escapeHtml(invoice.invoiceNumber);
  const customerName = escapeHtml(invoice.customerName);
  const issueDate = escapeHtml(invoice.issueDate);
  const dueDate = escapeHtml(invoice.dueDate);
  const gstRate = Number(invoice.gstRate || 0);
  const taxableAmount = Number(invoice.taxableAmount ?? invoice.totalAmount);
  const gstAmount = taxableAmount * gstRate / 100;
  const totalAmount = Number(invoice.totalAmount || 0);

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Invoice ${invoiceNumber}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 800px;
          margin: 40px auto;
          color: #222;
        }
        h1 { text-align: center; }
        .details { margin: 30px 0; line-height: 1.8; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ccc; padding: 12px; text-align: left; }
        .amount { text-align: right; }
        .total { font-size: 20px; font-weight: bold; }
        @media print { body { margin: 10mm; } }
      </style>
    </head>
    <body>
      <h1>TAX INVOICE</h1>
      <div class="details">
        <strong>Business:</strong> ${escapeHtml(businessProfile.businessName)}<br>
        <strong>Email:</strong> ${escapeHtml(businessProfile.email)}
      </div>
      <div class="details">
        <strong>Invoice Number:</strong> ${invoiceNumber}<br>
        <strong>Customer:</strong> ${customerName}<br>
        <strong>Issue Date:</strong> ${issueDate}<br>
        <strong>Due Date:</strong> ${dueDate}
      </div>
      <table>
        <tr><th>Description</th><th class="amount">Amount</th></tr>
        <tr><td>Taxable Amount</td><td class="amount">${money(taxableAmount)}</td></tr>
        <tr><td>GST (${gstRate}%)</td><td class="amount">${money(gstAmount)}</td></tr>
        <tr><td class="total">Total</td><td class="amount total">${money(totalAmount)}</td></tr>
      </table>
      <p>Thank you for your business.</p>
      <script>
        window.onload = () => window.print();
      <\/script>
    </body>
    </html>
  `);

  printWindow.document.close();
}


$("showLogin").addEventListener("click", () => showAuth(false));
$("showRegister").addEventListener("click", () => showAuth(true));
$("registerForm").addEventListener("submit", async e => {
  e.preventDefault(); message("authMessage", "");
  const data = Object.fromEntries(new FormData(e.currentTarget));
  try {
    await api("/api/auth/register", { method: "POST", body: JSON.stringify(data) });
    await refreshCsrf();
    await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: data.email, password: data.password }) });
    await refreshCsrf(); await loadApp();
  } catch (err) { message("authMessage", err.message); }
});
$("loginForm").addEventListener("submit", async e => {
  e.preventDefault(); message("authMessage", "");
  const data = Object.fromEntries(new FormData(e.currentTarget));
  try {
    await api("/api/auth/login", { method: "POST", body: JSON.stringify(data) });
    await refreshCsrf(); await loadApp();
  } catch (err) { message("authMessage", err.message); }
});
$("logoutButton").addEventListener("click", async () => {
  try { await api("/api/auth/logout", { method: "POST" }); await refreshCsrf(); showAuth(false); }
  catch (e) { alert(e.message); }
});
$("invoiceForm").addEventListener("submit", async e => {
  e.preventDefault();

  const form = e.currentTarget;
  message("invoiceMessage", "");

  const data = Object.fromEntries(new FormData(form));
  data.totalAmount = Number(data.totalAmount);
  data.gstRate = Number(data.gstRate);

  try {
    await api("/api/invoices", {
      method: "POST",
      body: JSON.stringify(data)
    });

    form.reset();
    message("invoiceMessage", "Invoice saved successfully.", true);
    await loadInvoices();
  } catch (err) {
    message("invoiceMessage", err.message);
  }
});


let statusChart = null;
let monthlyRevenueChart = null;
let paymentsChart = null;
let riskChart = null;

// ===== SMART PRO MONTHLY REVENUE CHART =====

function renderMonthlyRevenueChart() {
  const canvas = document.getElementById("monthlyRevenueChart");

  if (!canvas || typeof Chart === "undefined") return;

  const labels = [];
  const monthKeys = [];
  const invoicedData = [];
  const collectedData = [];

  const today = new Date();

  for (let i = 5; i >= 0; i--) {
    const date = new Date(
        today.getFullYear(),
        today.getMonth() - i,
        1
    );

    const monthKey =
        date.getFullYear() + "-" +
        String(date.getMonth() + 1).padStart(2, "0");

    monthKeys.push(monthKey);

    labels.push(
        date.toLocaleDateString("en-IN", {
          month: "short",
          year: "numeric"
        })
    );

    invoicedData.push(0);
    collectedData.push(0);
  }

  invoices.forEach(invoice => {
    const issueMonth = String(invoice.issueDate || "").slice(0, 7);
    const monthIndex = monthKeys.indexOf(issueMonth);

    if (monthIndex !== -1) {
      invoicedData[monthIndex] += Number(invoice.totalAmount || 0);
      collectedData[monthIndex] += Number(invoice.paidAmount || 0);
    }
  });

  if (monthlyRevenueChart) {
    monthlyRevenueChart.destroy();
  }

  monthlyRevenueChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Total Invoiced",
          data: invoicedData,
          backgroundColor: "#2563eb",
          borderRadius: 6
        },
        {
          label: "Amount Collected",
          data: collectedData,
          backgroundColor: "#10b981",
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top"
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: value => "₹" + Number(value).toLocaleString("en-IN")
          }
        }
      }
    }
  });
}
function renderCharts() {
  if (typeof Chart === "undefined") return;

  const statusCanvas = document.getElementById("statusChart");
  const paymentsCanvas = document.getElementById("paymentsChart");
  const riskCanvas = document.getElementById("riskChart");

  if (!statusCanvas || !paymentsCanvas || !riskCanvas) return;

  const statusCounts = {};
  for (const invoice of invoices) {
    statusCounts[invoice.status] = (statusCounts[invoice.status] || 0) + 1;
  }

  if (statusChart) statusChart.destroy();
  statusChart = new Chart(statusCanvas, {
    type: "pie",
    data: {
      labels: Object.keys(statusCounts).length
          ? Object.keys(statusCounts)
          : ["No invoices"],
      datasets: [{
        data: Object.values(statusCounts).length
            ? Object.values(statusCounts)
            : [1]
      }]
    },
    options: { responsive: true, maintainAspectRatio: true }
  });

  if (paymentsChart) paymentsChart.destroy();
  paymentsChart = new Chart(paymentsCanvas, {
    type: "bar",
    data: {
      labels: ["Invoiced", "Collected", "Outstanding"],
      datasets: [{
        label: "Amount (₹)",
        data: [
          invoices.reduce((sum, i) => sum + Number(i.totalAmount || 0), 0),
          invoices.reduce((sum, i) => sum + Number(i.paidAmount || 0), 0),
          invoices.reduce((sum, i) => sum + Number(i.balance || 0), 0)
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: { y: { beginAtZero: true } }
    }
  });

  const riskCounts = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const invoice of invoices) {
    const level = invoice.riskLevel || "LOW";
    if (riskCounts[level] !== undefined) riskCounts[level]++;
  }

  if (riskChart) riskChart.destroy();
  riskChart = new Chart(riskCanvas, {
    type: "pie",
    data: {
      labels: ["LOW", "MEDIUM", "HIGH"],
      datasets: [{
        data: [riskCounts.LOW, riskCounts.MEDIUM, riskCounts.HIGH]
      }]
    },
    options: { responsive: true, maintainAspectRatio: true }
  });
}

// ===== SMART PRO DASHBOARD NAVIGATION =====


/* Webcam Invoice Scanner - OCR */
(() => {
  const video = document.getElementById("ocrVideo");
  const canvas = document.getElementById("ocrCanvas");
  const startBtn = document.getElementById("startOcrCamera");
  const captureBtn = document.getElementById("captureOcrImage");
  const stopBtn = document.getElementById("stopOcrCamera");
  const status = document.getElementById("ocrStatus");
  const result = document.getElementById("ocrResult");

  if (!video || !canvas || !startBtn || !captureBtn ||
      !stopBtn || !status || !result) return;

  let cameraStream = null;
  let processing = false;

  startBtn.addEventListener("click", async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access requires localhost or HTTPS.");
      }

      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      video.srcObject = cameraStream;
      video.style.display = "block";
      await video.play();

      startBtn.disabled = true;
      captureBtn.disabled = false;
      stopBtn.disabled = false;
      status.textContent = "Camera ready. Point it at an invoice.";
    } catch (error) {
      status.textContent = "Camera error: " + error.message;
    }
  });

  captureBtn.addEventListener("click", async () => {
    if (!cameraStream || processing) return;

    if (!video.videoWidth || !video.videoHeight) {
      status.textContent = "Wait for the camera image to appear.";
      return;
    }

    if (!window.Tesseract) {
      status.textContent = "OCR library unavailable. Check your internet connection.";
      return;
    }

    processing = true;
    captureBtn.disabled = true;

    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext("2d");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = context.getImageData(
          0, 0, canvas.width, canvas.height
      );
      const pixels = imageData.data;

      for (let i = 0; i < pixels.length; i += 4) {
        const gray = 0.299 * pixels[i] +
            0.587 * pixels[i + 1] +
            0.114 * pixels[i + 2];

        const enhanced = Math.max(
            0, Math.min(255, (gray - 128) * 1.5 + 128)
        );

        pixels[i] = enhanced;
        pixels[i + 1] = enhanced;
        pixels[i + 2] = enhanced;
      }

      context.putImageData(imageData, 0, 0);
      status.textContent = "Reading invoice text. Please wait...";

      const { data } = await Tesseract.recognize(canvas, "eng", {
        logger: message => {
          if (message.status === "recognizing text") {
            status.textContent =
                "Recognizing text: " +
                Math.round((message.progress || 0) * 100) + "%";
          }
        },
        tessedit_pageseg_mode: "6"
      });

      result.value = data.text || "";
      status.textContent = result.value.trim()
          ? "Text extraction complete. Review the result."
          : "No text detected. Try better lighting and recapture.";
    } catch (error) {
      status.textContent = "OCR error: " + error.message;
    } finally {
      processing = false;
      captureBtn.disabled = !cameraStream;
    }
  });

  stopBtn.addEventListener("click", () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }

    video.srcObject = null;
    video.style.display = "none";
    startBtn.disabled = false;
    captureBtn.disabled = true;
    stopBtn.disabled = true;
    status.textContent = "Camera stopped.";
  });
})();
// ===== SMART PRO DASHBOARD NAVIGATION =====

function showSmartPage(page) {
  const validPages = [
    "dashboard",
    "create",
    "analytics",
    "invoices",
    "products",
    "scanner"
  ];
  if (!validPages.includes(page)) return;

  document.querySelectorAll("[data-view]").forEach(section => {
    section.hidden = section.dataset.view !== page;
  });

  document.querySelectorAll(".sidebarLink[data-page]").forEach(link => {
    const isActive = link.dataset.page === page;
    link.classList.toggle("active", isActive);

    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  if (page === "analytics" && typeof renderCharts === "function") {
    requestAnimationFrame(() => renderCharts());
  }
}

document.querySelectorAll(".sidebarLink[data-page]").forEach(link => {
  link.addEventListener("click", event => {
    event.preventDefault();
    showSmartPage(link.dataset.page);
  });
});

// Open Dashboard by default
showSmartPage("dashboard");

async function loadProducts() {
  const rows = document.getElementById("productRows");
  if (!rows) return;

  try {
    const products = await api("/api/products");

    document.getElementById("totalProducts").textContent = products.length;

    const lowStock = products.filter(
        p => p.stock <= p.lowStockLevel
    );

    document.getElementById("lowStockProducts").textContent = lowStock.length;

    const totalValue = products.reduce(
        (sum, p) => sum + p.price * p.stock, 0
    );

    document.getElementById("inventoryValue").textContent =
        "₹" + totalValue.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });

    rows.replaceChildren();

    if (products.length === 0) {
      const row = rows.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 6;
      cell.textContent = "No products added yet.";
      return;
    }

    products.forEach(p => {
      const row = rows.insertRow();

      [
        p.name,
        p.sku,
        money(p.price),
        String(p.stock),
        p.stock <= p.lowStockLevel ? "Low Stock" : "In Stock"
      ].forEach(value => {
        const cell = row.insertCell();
        cell.textContent = value;

        if (value === "Low Stock") {
          cell.style.color = "#ef4444";
          cell.style.fontWeight = "700";
        } else if (value === "In Stock") {
          cell.style.color = "#22c55e";
          cell.style.fontWeight = "700";
        }     });

      const actions = row.insertCell();

      const editBtn = document.createElement("button");
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", async () => {
        const stock = prompt("Enter new stock:", p.stock);
        if (stock === null) return;

        if (stock.trim() === "" || !Number.isInteger(Number(stock)) || Number(stock) < 0) {
          alert("Enter a valid stock quantity.");
          return;
        }

        try {
          await api(`/api/products/${p.id}`, {
            method: "PUT",
            body: JSON.stringify({
              name: p.name,
              sku: p.sku,
              price: p.price,
              stock: Number(stock),
              lowStockLevel: p.lowStockLevel
            })
          });
          await loadProducts();
        } catch (err) {
          alert(err.message);
        }
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", async () => {
        if (!confirm(`Delete ${p.name}?`)) return;

        try {
          await api(`/api/products/${p.id}`, {
            method: "DELETE"
          });
          await loadProducts();
        } catch (err) {
          alert(err.message);
        }
      });

      actions.append(editBtn, deleteBtn);
    });

  } catch (err) {
    rows.replaceChildren();
    const row = rows.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 6;
    cell.textContent = "Unable to load products.";
    console.error("Product loading failed:", err);
  }
}

console.log("PRODUCT SCRIPT LOADED");
const productForm = document.getElementById("productForm");

if (productForm) {
  productForm.addEventListener("submit", async event => {
    event.preventDefault();

    const message = document.getElementById("productMessage");
    const button = productForm.querySelector('button[type="submit"]');

    const product = {
      name: document.getElementById("productName").value.trim(),
      sku: document.getElementById("productSku").value.trim(),
      price: Number(document.getElementById("productPrice").value),
      stock: Number(document.getElementById("productStock").value),
      lowStockLevel: Number(document.getElementById("productLowStock").value)
    };

    button.disabled = true;
    message.textContent = "Saving product...";

    try {
      await api("/api/products", {
        method: "POST",
        body: JSON.stringify(product)
      });

      message.textContent = "Product added successfully!";
      productForm.reset();
      await loadProducts();

    } catch (err) {
      message.textContent = "Failed to save product. Check console.";
      console.error("Product save failed:", err);
    } finally {
      button.disabled = false;
    }
  });
}

document.querySelectorAll('[data-page="products"]').forEach(link => {
  link.addEventListener("click", () => {
    loadProducts();
  });
});
