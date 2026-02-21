// ================= SUPABASE =================
const SUPABASE_URL = "https://kwkclwhmoygunqmlegrg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mVX5MnjwM770cNjgiL6yLw_LDNl9pML";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ================= HELPERS =================
const $ = (id) => document.getElementById(id);

function setStatus(txt) {
  $("status").textContent = txt || "";
}

function showError(msg) {
  const el = $("errorBox");
  el.style.display = "block";
  el.textContent = msg;
}

// ================= LOGIN =================
async function requireLogin() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;

  if (!data?.session) {
    window.location.href = "../mayorista.html";
    return null;
  }
  return data.session;
}

// ================= PERFIL =================
async function loadCustomerProfileByAuth(userId) {
  const { data, error } = await supabaseClient
    .from("customers")
    .select("id,cod_cliente,business_name")
    .eq("auth_user_id", userId)
    .single();

  if (error) throw error;
  if (!data) throw new Error("No se encontró el perfil del cliente.");
  return data;
}

// ================= CARGA VENTAS =================
async function loadSalesLines(customerCode) {
  const cod = String(customerCode || "").trim();

  const { data, error } = await supabaseClient
    .from("sales_lines")
    .select("invoice_date,item_code,boxes")
    .eq("customer_code", cod);

  if (error) throw error;
  return data || [];
}

// ================= AGRUPAR (item + mes) =================
function toMonthKey(dateStr) {
  const d = new Date(dateStr);
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  return `${y}-${String(m).padStart(2, "0")}`; // 2026-01
}

function monthLabel(monthKey) {
  // monthKey: YYYY-MM
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const mes = d.toLocaleString("es-AR", { month: "short" });
  // "ene", "feb"... => "Ene/26"
  return `${mes.charAt(0).toUpperCase() + mes.slice(1)}/${String(y).slice(2)}`;
}

function buildMatrix(lines) {
  const monthsSet = new Set();
  const items = new Map(); // item_code => { total, months: {YYYY-MM: boxes} }

  for (const l of lines) {
    const code = String(l.item_code ?? "").trim();
    if (!code) continue;

    const mk = toMonthKey(l.invoice_date);
    monthsSet.add(mk);

    if (!items.has(code)) items.set(code, { total: 0, months: {} });

    const rec = items.get(code);
    const qty = Number(l.boxes || 0);

    rec.total += qty;
    rec.months[mk] = (rec.months[mk] || 0) + qty;
  }

  const months = Array.from(monthsSet).sort(); // YYYY-MM ordena perfecto
  return { items, months };
}

// ================= RENDER =================
function renderTable(items, months) {
  // Orden por total desc
  const rows = Array.from(items.entries()).sort((a, b) => b[1].total - a[1].total);

  let html = `<table>
    <thead>
      <tr>
        <th>Cod</th>
        <th>Descripción</th>
        <th>Total</th>`;

  for (const mk of months) {
    html += `<th>${monthLabel(mk)}</th>`;
  }

  html += `</tr></thead><tbody>`;

  for (const [code, rec] of rows) {
    html += `<tr>
      <td class="code">${code}</td>
      <td class="left">${code}</td>
      <td>${rec.total}</td>`;

    for (const mk of months) {
      const v = rec.months[mk] || "";
      html += `<td>${v || ""}</td>`;
    }

    html += `</tr>`;
  }

  html += `</tbody></table>`;

  $("histTable").innerHTML = html;
}

// ================= INIT =================
document.addEventListener("DOMContentLoaded", async () => {
  try {
    setStatus("Cargando...");

    const session = await requireLogin();
    if (!session) return;

    const profile = await loadCustomerProfileByAuth(session.user.id);

    $("clienteNombre").textContent =
      `Cliente: ${profile.business_name} (Cod ${profile.cod_cliente})`;

    const lines = await loadSalesLines(profile.cod_cliente);

    if (!lines.length) {
      setStatus("No hay compras registradas.");
      $("histTable").innerHTML = "";
      return;
    }

    const { items, months } = buildMatrix(lines);
    renderTable(items, months);

    setStatus("");
  } catch (err) {
    console.error(err);
    showError(err?.message || "Error al cargar historial.");
    setStatus("");
  }
});
