const $ = (id) => document.getElementById(id);
let invoices = [];
let businessProfile = {};
async function api(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = { ...(options.headers || {}) };

  if (options.body) {
    headers["Content-Type"] = "application/json";
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
    td.colSpan = 8;
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
      i.dueDate
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

    const pdfBtn = document.createElement("button");
    pdfBtn.textContent = "PDF";
    pdfBtn.addEventListener("click", () => downloadInvoicePdf(i));
    actions.append(pdfBtn);
    const reviewBtn = document.createElement("button");
    reviewBtn.textContent = "Review";
    reviewBtn.addEventListener("click", () => reviewInvoice(i));
    actions.append(reviewBtn);
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

async function downloadInvoicePdf(invoice){
  try {const response=await fetch(`/api/invoices/${invoice.id}/pdf`,{credentials:"same-origin"});if(!response.ok)throw new Error(`PDF request failed (${response.status})`);
    const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`invoice-${invoice.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g,"_")}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),15000);
  }catch(error){alert(error.message);}
}
async function reviewInvoice(invoice){
 try{const [fraud,health,audit,items,payments]=await Promise.all([
  api(`/api/invoices/${invoice.id}/fraud-review`),api(`/api/invoices/${invoice.id}/health`),api(`/api/invoices/${invoice.id}/audit`),api(`/api/invoices/${invoice.id}/items`),api(`/api/invoices/${invoice.id}/payment-history`)]);
  const details=[`Invoice: ${invoice.invoiceNumber}`,`Fraud review: ${fraud.level} (${fraud.score}/100)`,...fraud.warnings.map(x=>`⚠ ${x}`),`Health: ${health.valid?"Valid":"Needs review"}`,...health.warnings.map(x=>`• ${x}`),`Items: ${items.length}`,...items.map(x=>`  ${x.description} × ${x.quantity} @ ${money(x.unitPrice)} | GST ${x.gstRate}%`),`Recorded payment events: ${payments.length}`,...payments.map(x=>`  ${money(x.amount)} · ${x.receivedAt}`),`Audit history:`,...audit.map(x=>`  ${x.action} · ${x.at} · ${x.actor}`)];
  alert(details.join("\n")+"\n\nWarnings indicate potential issues, not proven fraud.");
 }catch(error){alert("Invoice review unavailable: "+error.message);}
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
    await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: data.email, password: data.password }) });
    await loadApp();
  } catch (err) { message("authMessage", err.message); }
});
$("loginForm").addEventListener("submit", async e => {
  e.preventDefault(); message("authMessage", "");
  const data = Object.fromEntries(new FormData(e.currentTarget));
  try {
    await api("/api/auth/login", { method: "POST", body: JSON.stringify(data) });
     await loadApp();
  } catch (err) { message("authMessage", err.message); }
});
$("logoutButton").addEventListener("click", async () => {
  try { await api("/api/auth/logout", { method: "POST" });  showAuth(false); }
  catch (e) { alert(e.message); }
});
// Itemized invoice editor: server recalculates all totals before saving.
const invoiceRows = $("invoiceItemRows");
const invoiceForm = $("invoiceForm");
let saleCatalog = [];
const normalizeProductKey = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
async function refreshSaleCatalog() {
  saleCatalog = await api("/api/products");
  document.querySelectorAll(".item-product").forEach(picker => {
    const selected = picker.value;
    picker.replaceChildren(new Option("Service / untracked item", ""));
    for (const product of saleCatalog) picker.add(new Option(`${product.name} · ${product.sku} (stock ${product.stock})`, product.id));
    if (saleCatalog.some(p => String(p.id) === selected)) picker.value = selected;
  });
}
function selectSaleProduct(row, product) {
  row.querySelector(".item-product").value = String(product.id);
  row.querySelector(".item-description").value = product.name;
  row.querySelector(".item-price").value = Number(product.price).toFixed(2);
  updateInvoiceTotals();
}
function addInvoiceItemRow() {
  if (invoiceRows.children.length >= 100) return null;
  const row = document.createElement("div");
  row.className = "invoice-item-row";
  row.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:10px;align-items:end;margin:10px 0";
  row.innerHTML = `<label>Description<input class="item-description" maxlength="200" required placeholder="Product or service"></label>
    <label>Catalog product<select class="item-product"><option value="">Service / untracked item</option></select></label>
    <label>Quantity<input class="item-quantity" type="number" min="0.001" step="0.001" value="1" required></label>
    <label>Unit price (₹)<input class="item-price" type="number" min="0" step="0.01" value="0" required></label>
    <label>Discount %<input class="item-discount" type="number" min="0" max="100" step="0.01" value="0"></label>
    <label>GST %<select class="item-gst"><option value="">Use invoice rate</option><option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option></select></label>
    <button type="button" class="remove-item">Remove</button>`;
  const picker = row.querySelector(".item-product");
  for (const product of saleCatalog) picker.add(new Option(`${product.name} · ${product.sku} (stock ${product.stock})`, product.id));
  picker.addEventListener("change", () => {
    const product = saleCatalog.find(p => String(p.id) === picker.value);
    if (product) selectSaleProduct(row, product);
    else updateInvoiceTotals();
  });
  // Match typed product descriptions as the cashier types, not only after blur.
  // Keep an explicit service selection untracked if it does not match a catalog item.
  row.querySelector(".item-description").addEventListener("input", () => {
    const key = normalizeProductKey(row.querySelector(".item-description").value);
    const selected = saleCatalog.find(p => String(p.id) === picker.value);
    if (selected && normalizeProductKey(selected.name) !== key && normalizeProductKey(selected.sku) !== key) picker.value = "";
    if (!picker.value && key) {
      const matches = saleCatalog.filter(p => normalizeProductKey(p.name) === key || normalizeProductKey(p.sku) === key || (p.barcode && normalizeProductKey(p.barcode) === key));
      if (matches.length === 1) selectSaleProduct(row, matches[0]);
    }
    updateInvoiceTotals();
  });
  row.querySelector(".remove-item").addEventListener("click", () => {
    if (invoiceRows.children.length > 1) { row.remove(); updateInvoiceTotals(); }
  });
  row.querySelectorAll("input,select").forEach(input => input.addEventListener("input", updateInvoiceTotals));
  invoiceRows.append(row);
  updateInvoiceTotals();
  return row;
}
// A POS scan adds a catalog-linked item; the backend makes the stock deduction.
async function addPosBarcode(rawCode) {
  const code = String(rawCode || "").trim();
  if (!code) throw Error("Enter or scan a barcode/SKU first.");
  await refreshSaleCatalog();
  const matches = saleCatalog.filter(p => p.sku.toLowerCase() === code.toLowerCase() || (p.barcode && p.barcode.toLowerCase() === code.toLowerCase()));
  if (matches.length !== 1) throw Error(matches.length ? "Multiple products match this code; correct catalog barcodes." : "No catalog product matches this barcode/SKU. Add the product to inventory first.");
  const product = matches[0];
  const existing = [...invoiceRows.children].find(row => row.querySelector(".item-product").value === String(product.id));
  const qty = existing ? Number(existing.querySelector(".item-quantity").value) + 1 : 1;
  if (qty > product.stock) throw Error(`Only ${product.stock} units of ${product.name} available.`);
  const empty = [...invoiceRows.children].find(row => !row.querySelector(".item-description").value.trim() && !row.querySelector(".item-product").value);
  const row = existing || empty || addInvoiceItemRow();
  if (!row) throw Error("Invoice limit: maximum 100 item lines.");
  selectSaleProduct(row, product);
  row.querySelector(".item-quantity").value = qty;
  updateInvoiceTotals();
  $("posFeedback").textContent = `${product.name}: ${qty} unit(s) in this invoice; ${product.stock} currently in stock.`;
  $("posBarcode").value = "";
}
$("posAddBarcode")?.addEventListener("click", async () => {
  try { await addPosBarcode($("posBarcode").value); } catch(e) { $("posFeedback").textContent = e.message; }
});
$("posBarcode")?.addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); $("posAddBarcode").click(); }
});
let posStream = null;
$("posStartCamera")?.addEventListener("click", async () => {
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw Error("Camera requires HTTPS or localhost.");
    if (posStream) posStream.getTracks().forEach(t => t.stop());
    posStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
    $("posCamera").srcObject = posStream;
    $("posCamera").style.display = "block";
    await $("posCamera").play();
    $("posFeedback").textContent = "Rear camera ready. Point at a barcode and click Scan camera frame.";
  } catch(e) { $("posFeedback").textContent = e.message; }
});
$("posScanCamera")?.addEventListener("click", async () => {
  try {
    if (!("BarcodeDetector" in window)) throw Error("BarcodeDetector is unsupported here. Use a USB scanner or enter the barcode manually.");
    if (!posStream || !$("posCamera").videoWidth) throw Error("Start the camera first.");
    const codes = await new BarcodeDetector({formats:["ean_13","ean_8","code_128","code_39","upc_a","upc_e","qr_code"]}).detect($("posCamera"));
    if (!codes.length) throw Error("No barcode detected. Try better lighting or move closer.");
    await addPosBarcode(codes[0].rawValue);
  } catch(e) { $("posFeedback").textContent = e.message; }
});
$("posStopCamera")?.addEventListener("click", () => {
  posStream?.getTracks().forEach(t => t.stop()); posStream = null;
  $("posCamera").srcObject = null; $("posCamera").style.display = "none";
});
function itemizedLines() {
  return [...invoiceRows.children].map(row => ({
    productId: row.querySelector(".item-product").value ? Number(row.querySelector(".item-product").value) : null,
    description: row.querySelector(".item-description").value.trim(),
    quantity: Number(row.querySelector(".item-quantity").value),
    unitPrice: Number(row.querySelector(".item-price").value),
    discountPercent: Number(row.querySelector(".item-discount").value)||0,
    gstRate: row.querySelector(".item-gst").value===""?null:Number(row.querySelector(".item-gst").value)
  }));
}
function updateInvoiceTotals() {
  const items=itemizedLines();
  const subtotal=items.reduce((sum,item)=>sum+item.quantity*item.unitPrice,0);
  const discount=Number(invoiceForm.elements.namedItem("discount").value)||0;
  const defaultRate=Number(invoiceForm.elements.namedItem("gstRate").value)||0;
  const discounted=items.map(x=>({gross:x.quantity*x.unitPrice,net:x.quantity*x.unitPrice*(1-x.discountPercent/100),rate:x.gstRate===null?defaultRate:x.gstRate}));
  const taxable=Math.max(0,discounted.reduce((s,x)=>s+x.net,0)-discount);
  const gst=discounted.reduce((s,x)=>s+Math.max(0,x.net-(subtotal?discount*x.gross/subtotal:0))*x.rate/100,0);
  $("invoiceItemTotals").textContent=`Subtotal: ${money(subtotal)} | Discount: ${money(discount)} | GST: ${money(gst)} | Total: ${money(taxable+gst)}`;
}
$("addInvoiceItem").addEventListener("click", addInvoiceItemRow);
invoiceForm.elements.namedItem("gstRate").addEventListener("change", updateInvoiceTotals);
invoiceForm.elements.namedItem("discount").addEventListener("input", updateInvoiceTotals);
addInvoiceItemRow();
invoiceForm.addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget;
  message("invoiceMessage", "");
  const data = Object.fromEntries(new FormData(form));
  data.gstRate = Number(data.gstRate);
  data.discount = Number(data.discount || 0);
  // Refresh inventory and resolve any exact-name/SKU matches before posting.
  // The server only deducts stock for items with a real productId.
  try { await refreshSaleCatalog(); }
  catch (err) { message("invoiceMessage", "Unable to verify product inventory: " + err.message); return; }
  data.items = itemizedLines();
  const unmatched = [];
  for (const item of data.items) {
    if (item.productId) continue;
    const key = normalizeProductKey(item.description);
    if (!key) continue;
    const matches = saleCatalog.filter(p => normalizeProductKey(p.name) === key || normalizeProductKey(p.sku) === key || (p.barcode && normalizeProductKey(p.barcode) === key));
    if (matches.length === 1) item.productId = matches[0].id;
    else if (matches.length > 1) unmatched.push(item.description + " (ambiguous)");
  }
  if (unmatched.length) { message("invoiceMessage", "Select a catalog product for: " + unmatched.join(", ")); return; }
  const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  if (!data.items.length || data.items.some(item => !item.description || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) {
    message("invoiceMessage", "Enter a valid description, quantity and price for every item.");
    return;
  }
  if (!Number.isFinite(data.discount) || data.discount < 0 || data.discount >= data.items.reduce((sum,x)=>sum+x.quantity*x.unitPrice*(1-x.discountPercent/100),0)) {
    message("invoiceMessage", "Discount must be at least zero and less than subtotal.");
    return;
  }
  try {
    await api("/api/invoices/itemized", { method: "POST", body: JSON.stringify(data) });
    form.reset();
    invoiceRows.replaceChildren();
    addInvoiceItemRow();
    message("invoiceMessage", "Invoice saved. Linked product stock deducted automatically.", true);
    await loadInvoices();
    await refreshSaleCatalog();
    document.dispatchEvent(new Event("invotracker:inventory-changed"));
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
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      video.srcObject = cameraStream;
      const track=cameraStream.getVideoTracks()[0];
      const zoomSlider=document.getElementById("smartZoom");
      if(zoomSlider){
        const caps=track.getCapabilities?.()||{};
        if(caps.zoom){zoomSlider.min=caps.zoom.min;zoomSlider.max=caps.zoom.max;zoomSlider.step=caps.zoom.step||0.1;zoomSlider.value=track.getSettings().zoom||caps.zoom.min;zoomSlider.disabled=false;}
        else{zoomSlider.disabled=true;document.getElementById("zoomNote").textContent="Hardware zoom unavailable on this device/browser.";}
      }
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
    "contacts","reports","dashboard",
    "create",
    "analytics",
    "invoices",
    "products",
    "investigator",
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

  if (page === "create") refreshSaleCatalog().catch(e => console.warn("Catalog unavailable", e));
  if (page === "investigator") loadInvestigations().catch(e=>{document.getElementById("investigatorStatus").textContent=e.message;});
  if (page === "contacts") loadContacts().catch(err=>message("contactMessage",err.message));
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

// ---- Consolidated business features ----
let businessContacts=[];
async function loadContacts(){
 businessContacts=await api("/api/contacts");
 const rows=$("contactRows");rows.replaceChildren();
 const customerSelect=$("savedCustomer");customerSelect.replaceChildren(new Option("Enter manually",""));
 for(const c of businessContacts){
  if(c.type==="CUSTOMER")customerSelect.append(new Option(c.name,c.id));
  const tr=document.createElement("tr");
  for(const val of [c.type,c.name,c.email||"",c.phone||"",c.gstin||"",c.paymentDetailsChanged?"⚠ Changed":(c.paymentLast4?"••••"+c.paymentLast4:"—")]){const td=document.createElement("td");td.textContent=val;tr.append(td);}
  const actions=document.createElement("td");const edit=document.createElement("button");edit.textContent="Edit";edit.addEventListener("click",()=>editContact(c));actions.append(edit);
  const del=document.createElement("button");del.textContent="Delete";del.addEventListener("click",async()=>{if(!confirm("Delete contact? Existing invoices remain unchanged."))return;try{await api(`/api/contacts/${c.id}`,{method:"DELETE"});await loadContacts();}catch(e){message("contactMessage",e.message);}});actions.append(del);tr.append(actions);rows.append(tr);
 }
}
let editingContactId=null;
function editContact(c){showSmartPage("contacts");editingContactId=c.id;const f=$("contactForm");for(const k of ["type","name","email","phone","gstin","address"])f.elements.namedItem(k).value=c[k]||"";f.elements.namedItem("paymentIdentifier").value="";message("contactMessage","Editing "+c.name+". Enter a payment identifier only if it has changed.",true);}
$("contactForm").addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget;const data=Object.fromEntries(new FormData(form));try{await api(editingContactId?`/api/contacts/${editingContactId}`:"/api/contacts",{method:editingContactId?"PUT":"POST",body:JSON.stringify(data)});editingContactId=null;form.reset();await loadContacts();message("contactMessage","Contact saved.",true);}catch(err){message("contactMessage",err.message);}});
$("savedCustomer").addEventListener("change",e=>{const c=businessContacts.find(c=>String(c.id)===e.target.value);if(!c)return;for(const [field,value] of [["customerName",c.name],["customerEmail",c.email],["customerGstin",c.gstin]])invoiceForm.elements.namedItem(field).value=value||"";});
$("invoiceTemplate").addEventListener("change",e=>{const placeholders={GROCERY:"Grocery item",FREELANCER:"Service / project",MANUFACTURING:"Manufactured product",TRANSPORT:"Freight / delivery service",HEALTHCARE:"Consultation / treatment",STANDARD:"Product or service"};document.querySelectorAll(".item-description").forEach(el=>{el.placeholder=placeholders[e.target.value]||placeholders.STANDARD;});});
$("downloadGstCsv").addEventListener("click",async()=>{try{const r=await fetch("/api/invoices/gst-export",{credentials:"same-origin"});if(!r.ok)throw new Error("Could not export report");const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="invotracker-gst-report.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),15000);}catch(e){alert(e.message);}});
const speechButton=$("voiceInvoice");
speechButton.addEventListener("click",()=>{const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Recognition){$("voiceStatus").textContent="Speech recognition is not available in this browser. Try Chrome with microphone access.";return;}
 const recognition=new Recognition();recognition.lang={en:"en-IN",hi:"hi-IN",mr:"mr-IN"}[$("languageSelect").value]||"en-IN";recognition.interimResults=false;
 $("voiceStatus").textContent="Listening… Speak a product or service description.";
 recognition.onresult=e=>{const transcript=e.results[0][0].transcript;const empty=[...invoiceRows.querySelectorAll(".item-description")].find(x=>!x.value);if(!empty)addInvoiceItemRow();const target=empty||[...invoiceRows.querySelectorAll(".item-description")].at(-1);target.value=transcript;updateInvoiceTotals();$("voiceStatus").textContent="Draft item: "+transcript+" — review quantity, price and GST before saving.";};
 recognition.onerror=e=>{$("voiceStatus").textContent="Speech error: "+e.error;};recognition.start();});
const translations={
 en:{contacts:"Customers & Suppliers",reports:"Reports & GST Export",create:"Create invoice",invoices:"Invoices",save:"Save invoice"},
 hi:{contacts:"ग्राहक और आपूर्तिकर्ता",reports:"रिपोर्ट और GST निर्यात",create:"इनवॉइस बनाएं",invoices:"इनवॉइस",save:"इनवॉइस सहेजें"},
 mr:{contacts:"ग्राहक आणि पुरवठादार",reports:"अहवाल आणि GST निर्यात",create:"इनव्हॉइस तयार करा",invoices:"इनव्हॉइस",save:"इनव्हॉइस जतन करा"}
};
$("languageSelect").addEventListener("change",e=>{const lang=e.target.value;document.querySelectorAll("[data-i18n]").forEach(el=>{el.textContent=translations[lang]?.[el.dataset.i18n]||translations.en[el.dataset.i18n]||el.textContent;});localStorage.setItem("invotracker-language",lang);});
$("languageSelect").value=localStorage.getItem("invotracker-language")||"en";$("languageSelect").dispatchEvent(new Event("change"));
loadContacts().catch(()=>{});

function preflightInvoice(){
 const f=$("invoiceForm"),notes=[];
 const number=f.elements.namedItem("invoiceNumber").value.trim();
 if(number&&invoices.some(i=>i.invoiceNumber.toLowerCase()===number.toLowerCase()))notes.push("Invoice number already exists");
 if(!f.elements.namedItem("customerEmail").value.trim())notes.push("Customer email missing (optional, but useful for reminders)");
 const gstin=f.elements.namedItem("customerGstin").value.trim();if(gstin&&!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(gstin))notes.push("GSTIN format needs review");
 const issue=f.elements.namedItem("issueDate").value,due=f.elements.namedItem("dueDate").value;
 if(issue&&due&&due<issue)notes.push("Due date is before issue date");
 $("invoicePreflight").textContent=notes.length?"Pre-save checks: "+notes.join(" • "):"Pre-save checks: No obvious problems detected. Confirm tax details before issuing.";
}
$("invoiceForm").addEventListener("input",preflightInvoice);
preflightInvoice();



// ===== INNOVATION SUITE: editable draft extraction (never saves automatically) =====
(function () {
  const $i = id => document.getElementById(id);
  const invoice = $i('invoiceForm');
  const normalize = s => (s || '').replace(/[₹,]/g, '').replace(/\s+/g, ' ').trim();
  const clampRate = r => [0,5,12,18,28].includes(Number(r)) ? Number(r) : null;
  const today = () => new Date().toLocaleDateString('en-CA');
  function draftFromText(raw, scanned=false) {
    const text = raw.replace(/[\u00a0]/g,' ').trim();
    if (!text) throw Error('Enter a description or extract text from a bill first.');
    const gstMatch = text.match(/(?:GST|IGST|CGST\s*\+\s*SGST|tax)\s*(?:rate)?\s*[:=]?\s*(\d{1,2}(?:\.\d+)?)\s*%|(?:with|at)\s*(\d{1,2}(?:\.\d+)?)\s*%\s*(?:GST|tax)/i);
    const gst = gstMatch ? clampRate(gstMatch[1] || gstMatch[2]) : null;
    const customer = text.match(/(?:bill|invoice)\s+(?:for|to)\s+([^,\n.]+?)(?=\s*[,\n.]|\s+\d+\s+[a-z]|\s+with\s+\d+\s*%|$)/i) || text.match(/(?:customer|bill\s*to|buyer)\s*[:\-]\s*([^\n,]+)/i);
    const number = text.match(/(?:invoice\s*(?:no\.?|number|#)|bill\s*(?:no\.?|#))\s*[:#-]?\s*([A-Z0-9\/-]+)/i);
    const found=[];
    // Spoken/text commands: "5 keyboards at ₹800 each" or "2 mice x 350".
    const command=/(\d+(?:\.\d+)?)\s+([\p{L}][\p{L}\p{N}\s\-]{1,65}?)\s*(?:at|@|x|×)\s*₹?\s*([\d,]+(?:\.\d{1,2})?)(?:\s*(?:each|per\s*(?:item|piece|unit)))?/giu;
    for(const m of text.matchAll(command)) {
      const desc=m[2].replace(/^(?:and|plus)\s+/i,'').trim();
      const qty=Number(m[1]), price=Number(normalize(m[3]));
      if(qty>0&&price>=0&&desc&&!/^(?:gst|tax|discount)$/i.test(desc))found.push({description:desc,quantity:qty,unitPrice:price});
    }
    if(scanned && !found.length) {
      // Conservative OCR rows: description, quantity, unit price; do not invent values.
      for(const line of text.split(/\r?\n/)) {
        const m=line.trim().match(/^([A-Za-z][\w ()\/-]{2,55}?)\s+(\d+(?:\.\d+)?)\s+(?:₹\s*)?([\d,]+(?:\.\d{1,2})?)(?:\s+[\d,.]+)?$/);
        if(m && !/total|subtotal|discount|amount|tax|gst|balance|invoice/i.test(m[1]))found.push({description:m[1].trim(),quantity:Number(m[2]),unitPrice:Number(normalize(m[3]))});
      }
    }
    const notes=[];
    if(!found.length)notes.push('No reliable item rows detected; add or correct products manually.');
    if(!customer)notes.push('Customer not confidently detected; enter it manually.');
    if(gst===null)notes.push('GST rate not confidently detected; verify the selected rate.');
    if(scanned)notes.push('OCR can misread digits. Compare every field with the source image.');
    return {customer:customer?.[1]?.trim()||'',number:number?.[1]||'',gst,items:found.slice(0,100),notes};
  }
  function applyDraft(draft,source) {
    if(draft.customer)invoice.elements.namedItem('customerName').value=draft.customer.slice(0,160);
    if(draft.number)invoice.elements.namedItem('invoiceNumber').value=draft.number.slice(0,60);
    if(draft.gst!==null)invoice.elements.namedItem('gstRate').value=String(draft.gst);
    if(!invoice.elements.namedItem('issueDate').value)invoice.elements.namedItem('issueDate').value=today();
    if(!invoice.elements.namedItem('dueDate').value)invoice.elements.namedItem('dueDate').value=today();
    if(draft.items.length) {
      invoiceRows.replaceChildren();
      for(const item of draft.items){addInvoiceItemRow();const row=invoiceRows.lastElementChild;row.querySelector('.item-description').value=item.description.slice(0,200);row.querySelector('.item-quantity').value=item.quantity;row.querySelector('.item-price').value=item.unitPrice;}
    }
    updateInvoiceTotals();
    showSmartPage('create');
    const info=`${source}: ${draft.items.length} item(s) recognized. ${draft.notes.join(' ')} Review and edit the form before saving.`;
    $i('copilotFeedback').textContent=info;
    $i('invoiceMessage').textContent=info;
    invoice.scrollIntoView({behavior:'smooth',block:'start'});
  }
  $i('copilotParse').addEventListener('click',()=>{try{applyDraft(draftFromText($i('copilotPrompt').value),'Copilot');}catch(e){$i('copilotFeedback').textContent=e.message;}});
  $i('copilotSpeak').addEventListener('click',()=>{
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Recognition){$i('copilotFeedback').textContent='Speech recognition unavailable in this browser. Type the instruction instead.';return;}
    const recognition=new Recognition();recognition.lang='en-IN';recognition.interimResults=false;
    recognition.onresult=e=>{$i('copilotPrompt').value=e.results[0][0].transcript;$i('copilotFeedback').textContent='Dictation captured. Click Prepare editable draft.';};
    recognition.onerror=e=>$i('copilotFeedback').textContent='Microphone recognition error: '+e.error;
    recognition.start();
  });
  $i('ocrToDraft').addEventListener('click',()=>{try{applyDraft(draftFromText($i('ocrResult').value,true),'Scanned invoice');}catch(e){$i('ocrStatus').textContent=e.message;}});
  $i('readOcrUpload').addEventListener('click',async()=>{
    const file=$i('ocrUpload').files?.[0],status=$i('ocrStatus');
    if(!file){status.textContent='Choose a bill image first.';return;}
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024){status.textContent='Use PNG/JPEG/WebP smaller than 8 MB.';return;}
    if(!window.Tesseract){status.textContent='OCR library did not load. Check network access.';return;}
    const btn=$i('readOcrUpload');btn.disabled=true;status.textContent='Reading image in your browser…';
    try{const output=await Tesseract.recognize(file,'eng',{logger:p=>{if(p.status==='recognizing text')status.textContent=`Reading: ${Math.round(p.progress*100)}%`;}});
      $i('ocrResult').value=output.data.text||'';status.textContent='Text extracted. Review it, then click Convert text to invoice draft.';
    }catch(e){status.textContent='OCR failed: '+e.message;}finally{btn.disabled=false;}
  });
})();

// ===== INNOVATION SUITE: explainable fraud cases with recorded decisions =====
async function loadInvestigations(){
  const target=document.getElementById('investigatorCases'),status=document.getElementById('investigatorStatus');
  status.textContent='Loading invoice reviews…';target.replaceChildren();
  const all=await api('/api/invoices');
  const reviews=await Promise.all(all.map(async inv=>{
    try{return {invoice:inv,review:await api(`/api/invoices/${inv.id}/fraud-review`),caseInfo:await api(`/api/invoices/${inv.id}/investigation`)};}
    catch(e){return {invoice:inv,error:e.message};}
  }));
  reviews.sort((a,b)=>(b.review?.score||0)-(a.review?.score||0));
  status.textContent=`${reviews.length} invoice(s) checked. Risk signals are screening hints, not fraud findings.`;
  for(const {invoice:inv,review,caseInfo,error} of reviews){
    const card=document.createElement('article');card.className='investigation-case';
    const heading=document.createElement('h3');heading.textContent=`${inv.invoiceNumber} · ${inv.customerName} · ${money(inv.totalAmount)}`;card.append(heading);
    if(error){const p=document.createElement('p');p.textContent='Unable to load review: '+error;card.append(p);target.append(card);continue;}
    const p=document.createElement('p');p.textContent=`Risk: ${review.level} (${review.score}/100) · Investigation: ${caseInfo.status}`;card.append(p);
    const ul=document.createElement('ul');for(const reason of review.warnings.length?review.warnings:['No configured risk patterns detected.']){const li=document.createElement('li');li.textContent=reason;ul.append(li);}card.append(ul);
    const label=document.createElement('label');label.textContent='Investigation outcome';
    const select=document.createElement('select');for(const value of ['OPEN','REVIEWING','RESOLVED','FALSE_POSITIVE']){const opt=document.createElement('option');opt.value=value;opt.textContent=value.replaceAll('_',' ');select.append(opt);}select.value=caseInfo.status;label.append(select);card.append(label);
    const notes=document.createElement('textarea');notes.rows=2;notes.maxLength=500;notes.placeholder='Evidence and verification notes (no sensitive banking details)';notes.value=caseInfo.notes||'';card.append(notes);
    const save=document.createElement('button');save.type='button';save.textContent='Save investigation decision';card.append(save);
    const result=document.createElement('p');result.setAttribute('role','status');card.append(result);
    save.addEventListener('click',async()=>{save.disabled=true;try{const updated=await api(`/api/invoices/${inv.id}/investigation`,{method:'PUT',body:JSON.stringify({status:select.value,notes:notes.value})});result.textContent=`Saved: ${updated.status}. Decision recorded in audit history.`;}catch(e){result.textContent=e.message;}finally{save.disabled=false;}});
    target.append(card);
  }
}
document.getElementById('refreshInvestigations').addEventListener('click',()=>loadInvestigations().catch(e=>document.getElementById('investigatorStatus').textContent=e.message));
