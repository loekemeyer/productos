// ================= SUPABASE =================
const SUPABASE_URL = "https://kwkclwhmoygunqmlegrg.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3a2Nsd2htb3lndW5xbWxlZ3JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MjA2NzUsImV4cCI6MjA4NTA5NjY3NX0.soqPY5hfA3RkAJ9jmIms8UtEGUc4WpZztpEbmDijOgU";

let ALL_SUGS = [];
let SHOW_ALL_SUGS = false;
let WEB_ORDER_DISCOUNT = 0.02; // default fallback}
let activeTab = "sugerencias"; // o "novedades"

// ================= IMÁGENES (igual que mayorista) =================
const BASE_IMG = `${SUPABASE_URL}/storage/v1/object/public/products-images/`;
// si no querés cache, podés usar Date.now()
const IMG_VERSION = "1";

function imgUrlByCod(cod) {
  const c = String(cod || "").trim();
  if (!c) return "img/no-image.jpg";
  return `${BASE_IMG}${encodeURIComponent(c)}.jpg?v=${encodeURIComponent(IMG_VERSION)}`;
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ================= UI HELPERS =================
const $ = (id) => document.getElementById(id);

async function getWebOrderDiscount() {
  try {
    const { data, error } = await sb
      .from("app_settings")
      .select("value")
      .eq("key", "web_order_discount")
      .single();

    if (error) throw error;
    return Number(data?.value) || 0;
  } catch (e) {
    console.warn("No se pudo leer web_order_discount, usando default 0.02", e);
    return 0.02;
  }
}

function setStatus(msg) {
  $("status").style.display = "block";
  $("status").innerText = msg;
}

function showTable(show) {
  $("tablaSug").style.display = show ? "table" : "none";
}

function pick(obj, keys, fallback = "") {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "")
      return obj[k];
  }
  return fallback;
}

function fmtPrecio(n) {
  const val = Number(n);
  if (isNaN(val)) return "";
  return val.toLocaleString("es-AR", { minimumFractionDigits: 2 });
}

// ================= STATE =================
let cliente = null;
let sugerenciasGlobal = [];
let sugMostrados = 5;

// ================= AUTH =================
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

  console.log("SUGERENCIAS session user:", data.session.user?.id); // ✅ DEBUG

  return data.session;
}

async function getCliente(session) {
  const { data, error } = await sb
    .from("customers")
    .select("cod_cliente, business_name, dto_vol")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (error) {
    console.error("getCliente error:", error);
    setStatus("No se pudo cargar el cliente (RLS o datos).");
    return null;
  }
  if (!data) {
    setStatus("No se encontró tu cliente asociado. (customers.auth_user_id)");
    return null;
  }
  return data;
}

// ================= DATA (RPC) =================
async function loadSugerencias(codCliente) {
  try {
    setStatus(activeTab === "novedades" ? "Cargando novedades…" : "Cargando sugerencias…");

    // Traer datos según pestaña
    const rows =
      activeTab === "novedades"
        ? await fetchNovedades()
        : await fetchSugerencias(codCliente);

    sugerenciasGlobal = rows || [];

    // Reset cantidad mostrada
    sugMostrados = 5; // arranca en 5 para ambas

    renderSug();
    setStatus("");

    console.log(
      "TAB:", activeTab,
      "TOTAL:", sugerenciasGlobal.length,
      "MOSTRADOS:", sugMostrados
    );
  } catch (e) {
    console.error("loadSugerencias crash:", e);
    sugerenciasGlobal = [];
    renderSug();
    setStatus("Error cargando datos.");
  }
}

// ================= RENDER =================
function renderSug() {
  const thead = $("theadSug");
  const tbody = $("tbodySug");

  thead.innerHTML = `
    <tr>
      <th style="width:120px">Img</th>
      <th style="width:80px">Cod</th>
      <th>Descripción</th>
      <th style="width:70px">UxB</th>
      <th style="width:140px">Tu precio contado</th>
      <th style="width:300px">Motivo</th>
      <th style="width:220px">Pedido</th>
    </tr>
  `;

  tbody.innerHTML = "";

  const slice = sugerenciasGlobal.slice(0, sugMostrados);

  slice.forEach((r) => {
    const cod = pick(r, ["cod", "codigo", "item_code"]);
    const desc = pick(r, ["description", "descripcion", "articulo"]);
    const uxb = pick(r, ["uxb"]);
    const listPrice = Number(pick(r, ["list_price", "price_cash", "precio"])) || 0;
const dtoVol = Number(cliente?.dto_vol || 0);

// tuPrecio = list_price * (1 - dto_vol)
const tuPrecio = listPrice * (1 - dtoVol);

// tuPrecioContado = tuPrecio * (1 - WEB_ORDER_DISCOUNT) * (1 - 0.25)
const tuPrecioContado = Math.round(
  tuPrecio * (1 - WEB_ORDER_DISCOUNT) * (1 - 0.25)
);
    const msg = pick(r, ["texto_clientes", "mensaje", "texto"], "");
    const pid = String(pick(r, ["product_id", "id", "productId"], "")).trim();

    tbody.innerHTML += `
      <tr>
        <td class="imgcell">
          <img
            class="sug-img"
            src="${imgUrlByCod(cod)}"
            alt="${String(desc || "")}"
            onerror="this.onerror=null;this.src='img/no-image.jpg'"
          />
        </td>
        <td>${cod}</td>
        <td class="desc">${desc}</td>
        <td>${uxb}</td>
        <td>
  $${tuPrecioContado.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })}
</td>       
        <td class="msg">${msg}</td>
        <td>
          <div class="sug-action">
            <div class="sug-stepper">
              <button type="button" class="sug-step-btn" onclick="sugDec('${pid}')">−</button>
              <input id="sugqty-${pid}" class="sug-step-in" type="number" min="0" value="0" />
              <button type="button" class="sug-step-btn" onclick="sugInc('${pid}')">+</button>
            </div>

            <button
              type="button"
              class="sug-add-btn"
              id="sugadd-${pid}"
              onclick="sugAdd('${pid}')"
              ${pid ? "" : "disabled"}
              title="${pid ? "" : "Falta product_id en la sugerencia"}"
            >
              Agregar al pedido
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  showTable(true);

  const btnVerMas = $("btnVerMas");
  if (btnVerMas) {
    btnVerMas.style.display =
      sugerenciasGlobal.length > sugMostrados ? "block" : "none";
  }
}

// ================= INIT =================
async function init() {
  try {
    setStatus("Cargando…");

    $("btnVerMas")?.addEventListener("click", () => {
  sugMostrados = Math.min(sugerenciasGlobal.length, sugMostrados + 5);
  renderSug();
});

    const session = await getSession();
    if (!session) return;

    cliente = await getCliente(session);
    if (!cliente) return;

    $("cliente").innerText =
      `Cliente: ${cliente.business_name} (${cliente.cod_cliente})`;

    WEB_ORDER_DISCOUNT = await getWebOrderDiscount();
    await loadSugerencias(cliente.cod_cliente);
  } catch (e) {
    console.error("Init crash:", e);
    setStatus("Error inesperado. Ver consola.");
  }

  // Tabs
$("tabSugerencias")?.addEventListener("click", async () => {
  activeTab = "sugerencias";
  $("tabSugerencias")?.classList.add("active");
  $("tabNovedades")?.classList.remove("active");

  sugMostrados = 5;
  await loadSugerencias(cliente.cod_cliente);
});

$("tabNovedades")?.addEventListener("click", async () => {
  activeTab = "novedades";
  $("tabNovedades")?.classList.add("active");
  $("tabSugerencias")?.classList.remove("active");

  sugMostrados = 5;
  await loadSugerencias(cliente.cod_cliente);
});

}

// ===== LOADER CONTROL (solo 1ra vez, con failsafe) =====
function setupLoaderOnce() {
  const loader = document.getElementById("pageLoader");
  if (!loader) return;

  const key = `lk_loader_seen_v1:${location.pathname.split("/").pop()}`;

  // si ya se vio, sacar instantáneo
  try {
    if (localStorage.getItem(key) === "1") {
      loader.remove();
      return;
    }
  } catch {}

  const kill = () => {
    const l = document.getElementById("pageLoader");
    if (!l) return;
    l.style.transition = "opacity 0.4s ease";
    l.style.opacity = "0";
    setTimeout(() => l.remove(), 450);
  };

  // pase lo que pase: máximo 12s
  setTimeout(kill, 12000);

  // normal: 5-10s
  const delay = 5000 + Math.random() * 5000;
  setTimeout(() => {
    try {
      localStorage.setItem(key, "1");
    } catch {}
    kill();
  }, delay);
}

async function fetchSugerencias(codCliente) {
  const { data, error } = await sb.rpc("sugerencias_cliente", { p_customer: String(codCliente) });
  if (error) throw error;
  return data || [];
}

async function fetchNovedades() {
  const { data, error } = await sb.rpc("novedades_marca");
  if (error) throw error;
  return data || [];
}
document.addEventListener("DOMContentLoaded", () => {
  setupLoaderOnce();
  init();
});

// ================= CARRITO (shared con mayorista) =================
const CART_LS_KEY = "lk_mayorista_cart_v1";

function readCartLS() {
  try {
    const raw = localStorage.getItem(CART_LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeCartLS(arr) {
  try {
    localStorage.setItem(CART_LS_KEY, JSON.stringify(arr));
  } catch {}
}

function addToCartLS(productId, qtyCajas) {
  const pid = String(productId || "").trim();
  const q = Math.max(1, parseInt(qtyCajas, 10) || 1);
  if (!pid) return;

  const cart = readCartLS();
  const found = cart.find((x) => String(x.productId) === pid);

  if (found) {
    found.qtyCajas = Math.max(1, (parseInt(found.qtyCajas, 10) || 0) + q);
  } else {
    cart.push({ productId: pid, qtyCajas: q });
  }

  writeCartLS(cart);
}

// Handlers globales para onclick del HTML
window.sugDec = function (pid) {
  const el = document.getElementById(`sugqty-${pid}`);
  if (!el) return;
  el.value = Math.max(0, (parseInt(el.value, 10) || 0) - 1);
};

window.sugInc = function (pid) {
  const el = document.getElementById(`sugqty-${pid}`);
  if (!el) return;
  el.value = Math.max(0, (parseInt(el.value, 10) || 0) + 1);
};

window.sugAdd = function (pid) {
  const el = document.getElementById(`sugqty-${pid}`);
  const qty = el ? Math.max(0, parseInt(el.value, 10) || 0) : 0;

  // ✅ si está en 0, no agrega
  if (qty <= 0) return;

  addToCartLS(pid, qty);

  const btn = document.getElementById(`sugadd-${pid}`);
  if (btn) {
    const prev = btn.textContent;
    btn.textContent = "Agregado ✓";
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = prev;
      btn.disabled = false;
    }, 900);
  }
};
