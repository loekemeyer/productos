// ================= SUPABASE =================
const SUPABASE_URL = "https://kwkclwhmoygunqmlegrg.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3a2Nsd2htb3lndW5xbWxlZ3JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MjA2NzUsImV4cCI6MjA4NTA5NjY3NX0.soqPY5hfA3RkAJ9jmIms8UtEGUc4WpZztpEbmDijOgU";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// helpers
const $ = (id) => document.getElementById(id);
const statusBox = $("status");
const tabla = $("tabla");
const thead = $("thead");
const tbody = $("tbody");

function setStatus(msg) {
  statusBox.style.display = "block";
  statusBox.innerText = msg;
  tabla.style.display = "none";
}

async function getSession() {
  const { data, error } = await sb.auth.getSession();
  if (error) {
    console.error("getSession error:", error);
    setStatus("Error de sesión.");
    return null;
  }

  if (!data?.session) {
    setStatus("No hay sesión iniciada. Volviendo a Mayorista…");
    setTimeout(() => (location.href = "./mayorista.html"), 800);
    return null;
  }

  return data.session;
}

async function getCliente(session) {
  const { data, error } = await sb
    .from("customers")
    .select("cod_cliente, business_name")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (error) {
    console.error("getCliente error:", error);
    setStatus("No se pudo cargar el cliente (RLS o datos).");
    return null;
  }
  if (!data) {
    setStatus("No se encontró tu cliente asociado. (falta vincular auth_user_id)");
    return null;
  }
  return data;
}

/**
 * IMPORTANTE
 * Este endpoint debe existir en Supabase:
 *   public.v_customer_item_month
 * y debe estar agregado por mes (ym = 'YYYY-MM') y por item_code.
 */
async function getHistory() {
  const { data, error } = await sb
    .from("v_customer_item_month")
    .select("ym, item_code, description, boxes")
    .order("ym", { ascending: false });

  if (error) {
    console.error("getHistory error:", error);
    setStatus("Error cargando historial.");
    return [];
  }

  return data || [];
}

function renderTabla(rows) {
  if (!rows || !rows.length) {
    setStatus("Sin datos");
    return;
  }

  // 1) Meses presentes (ym ya viene como 'YYYY-MM')
  const mesesSet = new Set();
  for (const r of rows) {
    const ym = (r.ym || "").trim();
    if (!/^\d{4}-\d{2}$/.test(ym)) continue;
    mesesSet.add(ym);
  }

  // Orden: más reciente a la izquierda (DESC)
  const meses = Array.from(mesesSet).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const meses60 = meses.slice(0, 60); // si hay 60 meses, muestra 60

  // 2) Agrupar por item_code y sumar cajas por mes (por si viniera repetido)
  const map = {};
  for (const r of rows) {
    const item = (r.item_code || "").trim();
    if (!item) continue;

    const key = (r.ym || "").trim();
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    if (!meses60.includes(key)) continue;

    const boxes = Number(r.boxes) || 0;

    if (!map[item]) {
      map[item] = {
        desc: (r.description || "").trim() || item,
        total: 0,
        meses: {},
      };
    }

    map[item].total += boxes;
    map[item].meses[key] = (map[item].meses[key] || 0) + boxes;
  }

  const arr = Object.entries(map)
    .map(([cod, v]) => ({ cod, ...v }))
    .sort((a, b) => b.total - a.total);

  // 3) Header
  thead.innerHTML = "";
  const trh = document.createElement("tr");

  ["Código", "Descripción", "Total"].forEach((t) => {
    const th = document.createElement("th");
    th.innerText = t;
    trh.appendChild(th);
  });

  // formato mmm-yy
  meses60.forEach((ym) => {
    const y = Number(ym.slice(0, 4));
    const m = Number(ym.slice(5, 7));
    const fecha = new Date(y, m - 1, 1);

    const nombre = fecha
      .toLocaleString("es-AR", { month: "short" })
      .replace(".", "")
      .toLowerCase();

    const th = document.createElement("th");
    th.innerText = `${nombre}-${String(y).slice(2)}`;
    trh.appendChild(th);
  });

  thead.appendChild(trh);

  // 4) Body
  tbody.innerHTML = "";

  for (const p of arr) {
    const tr = document.createElement("tr");

    const tdCod = document.createElement("td");
    tdCod.innerText = p.cod;
    tr.appendChild(tdCod);

    const tdDesc = document.createElement("td");
    tdDesc.innerText = p.desc;
    tdDesc.className = "desc";
    tr.appendChild(tdDesc);

    const tdTotal = document.createElement("td");
    tdTotal.innerText = p.total;
    tr.appendChild(tdTotal);

    meses60.forEach((ym) => {
      const td = document.createElement("td");
      td.innerText = p.meses[ym] ? String(p.meses[ym]) : "";
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  }

  // 5) Mostrar y habilitar scroll horizontal
  statusBox.style.display = "none";
  tabla.style.display = "table";
  tabla.style.width = "max-content";
  tabla.style.minWidth = "100%";

  const scrollParent = tabla.parentElement || document.body;
  scrollParent.style.overflowX = "auto";
}

async function init() {
  try {
    setStatus("Cargando...");
    const session = await getSession();
    if (!session) return;

    const cliente = await getCliente(session);
    if (!cliente) return;

    $("cliente").innerText = `Cliente: ${cliente.business_name} (${cliente.cod_cliente})`;

    const rows = await getHistory();
    renderTabla(rows);
  } catch (e) {
    console.error("Init crash:", e);
    setStatus("Error inesperado cargando historial. Ver consola.");
  }
}

document.addEventListener("DOMContentLoaded", init);