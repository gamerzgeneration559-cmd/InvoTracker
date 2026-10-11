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
  } catch (_) { showAuth(false); }
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
  renderCharts();
}
function renderInvoices() {
  const query = $("search").value.trim().toLowerCase();
  const rows = invoices.filter(i => `${i.invoiceNumber} ${i.customerName} ${i.status}`.toLowerCase().includes(query));
  $("invoiceRows").replaceChildren();
  if (!rows.length) {
    const tr = document.createElement("tr"); const td = document.createElement("td");
    td.colSpan = 10; td.textContent = invoices.length ? "No invoices match your search." : "No invoices yet. Create your first invoice above.";
    tr.append(td); $("invoiceRows").append(tr); return;
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
    for (const value of values) { const td = document.createElement("td"); td.textContent = value; tr.append(td); }
    const statusTd = document.createElement("td"); const pill = document.createElement("span");
    pill.className = `status ${i.status}`; pill.textContent = i.status.replaceAll("_", " "); statusTd.append(pill); tr.append(statusTd);
    const actions = document.createElement("td");
    const printBtn = document.createElement("button");
    printBtn.textContent = "Print Invoice";
    printBtn.addEventListener("click", () => printInvoice(i));
    actions.append(printBtn);

    if (i.balance > 0) {
      const pay = document.createElement("button"); pay.textContent = "Record payment";
      pay.addEventListener("click", () => recordPayment(i)); actions.append(pay);
    }
    const cancel = document.createElement("button"); cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => cancelInvoice(i)); actions.append(cancel); tr.append(actions);
    $("invoiceRows").append(tr);
  }
}
async function recordPayment(invoice) {
  const raw = prompt(`Outstanding balance: ${money(invoice.balance)}\nEnter payment amount (₹):`);
  if (raw === null) return;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) { alert("Enter a valid amount greater than zero."); return; }
  try { await api(`/api/invoices/${invoice.id}/payments`, { method: "POST", body: JSON.stringify({ amount }) }); await loadInvoices(); }
  catch (e) { alert(e.message); }
}
async function cancelInvoice(invoice) {
  if (!confirm(`Cancel invoice ${invoice.invoiceNumber}? This cannot be undone from this screen.`)) return;
  try { await api(`/api/invoices/${invoice.id}`, { method: "DELETE" }); await loadInvoices(); }
  catch (e) { alert(e.message); }
}

function printInvoice(invoice) {
  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    alert("Please allow pop-ups to print the invoice.");
    return;
  }

  const escapeHtml = (value) =>
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
  const taxableAmount = Number(
      invoice.taxableAmount ?? invoice.totalAmount
  );
  const gstAmount = taxableAmount * gstRate / 100;
  const totalAmount = Number(invoice.totalAmount || 0);

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
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
        th, td {
          border: 1px solid #ccc;
          padding: 12px;
          text-align: left;
        }
        .amount { text-align: right; }
        .total { font-size: 20px; font-weight: bold; }
        @media print {
          body { margin: 10mm; }
        }
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
        <tr><td>Taxable Amount</td>
            <td class="amount">${money(taxableAmount)}</td></tr>
        <tr><td>GST (${gstRate}%)</td>
            <td class="amount">${money(gstAmount)}</td></tr>
        <tr><td class="total">Total</td>
            <td class="amount total">${money(totalAmount)}</td></tr>
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
let paymentsChart = null;
let riskChart = null;

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


/* ===== InvoTracker Sidebar Navigation ===== */
document.querySelectorAll(".sidebarLink").forEach(link => {
  link.addEventListener("click", function (event) {
    const targetId = this.getAttribute("href");

    if (!targetId || !targetId.startsWith("#")) return;

    const target = document.querySelector(targetId);

    if (!target) {
      event.preventDefault();
      console.warn("Navigation target not found:", targetId);
      return;
    }

    document.querySelectorAll(".sidebarLink").forEach(item => {
      item.classList.remove("active");
    });

    this.classList.add("active");
    target.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });
});
