// ================= SUPABASE =================
const SUPABASE_URL = "https://kwkclwhmoygunqmlegrg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mVX5MnjwM770cNjgiL6yLw_LDNl9pML";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// helpers
const $ = (id) => document.getElementById(id);

function setStatus(txt) {
  $("statusBox").textContent = txt;
}

function showError(msg) {
  const el = $("errorBox");
  el.style.display = "block";
  el.textContent = msg;
}

function showTable(show) {
  $("histTable").style.display = show ? "table" : "none";
}

function volverInicio() {
  window.location.href = "./mayorista.html";
}

// ================= LOGIN REQUIRED =================
async function requireLogin() {
  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    window.location.href = "./mayorista.html";
    return null;
  }

  return data.session;
}

// ================= PERFIL =================
async function loadCustomerProfileByAuth(userId) {
  const { data, error } = await supabaseClient
    .from("customers")
    .select("id, cod_cliente, business_name")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("No se encontró el perfil del cliente.");

  return data;
}

// ================= HISTORIAL =================
async function loadOrders(customerCode) {
  const cod = String(customerCode || "").trim();

  const { data, error } = await supabaseClient
    .from("sales_lines")
    .select("invoice_date, customer_code, item_code, boxes")
    .eq("customer_code", cod)
    .order("invoice_date", { ascending: false });

  if (error) throw error;
  return data || [];
}

// ================= RENDER =================
function render(lines) {
  const tbody = $("histTbody");

  if (!lines.length) {
    setStatus("No hay compras registradas.");
    showTable(false);
    return;
  }

  setStatus("");
  showTable(true);

  tbody.innerHTML = lines.map(l => `
    <tr>
      <td>${l.invoice_date}</td>
      <td>${l.item_code}</td>
      <td>${l.boxes}</td>
    </tr>
  `).join("");
}

// ================= INIT =================
document.addEventListener("DOMContentLoaded", async () => {
  try {
    setStatus("Cargando...");

    const session = await requireLogin();
    if (!session) return;

    const profile = await loadCustomerProfileByAuth(session.user.id);

    const line = $("histClientLine");
    if (line) {
      line.textContent =
        `Cliente: ${profile.business_name} (Cod ${profile.cod_cliente})`;
    }

    const lines = await loadOrders(profile.cod_cliente);
    render(lines);

  } catch (err) {
    console.error(err);
    showError("Error al cargar el historial.");
    showTable(false);
  }
});
