'use strict';

/***********************
 * SUPABASE CONFIG
 ***********************/
const SUPABASE_URL = "https://kwkclwhmoygunqmlegrg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3a2Nsd2htb3lndW5xbWxlZ3JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MjA2NzUsImV4cCI6MjA4NTA5NjY3NX0.soqPY5hfA3RkAJ9jmIms8UtEGUc4WpZztpEbmDijOgU";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/***********************
 * UI CONSTANTS
 ***********************/
const WEB_ORDER_DISCOUNT = 0.025; // 2.5% siempre
const BASE_IMG = `${SUPABASE_URL}/storage/v1/object/public/products-images/`;
const IMG_VERSION = "2026-02-06-2"; // cambiá esto cuando actualices imágenes

/***********************
 * ORDEN FIJO (como pediste)
 ***********************/
const CATEGORY_ORDER = [
  'Abrelatas',
  'Peladores',
  'Sacacorchos',
  'Cortadores',
  'Ralladores',
  'Coladores',
  'Afiladores',
  'Utensilios',
  'Pinzas',
  'Destapadores',
  'Tapon Vino',
  'Repostería',
  'Madera',
  'Mate',
  'Accesorios',
  'Vidrio',
  'Cuchillos de untar',
  'Contenedores'
];

const UTENSILIOS_SUB_ORDER = [
  'Madera',
  'Silicona',
  'Nylon Premium',
  'Inoxidable',
  'Nylon'
];

/***********************
 * STATE
 ***********************/
let products = [];            // productos cargados
let currentSession = null;    // sesión supabase
let isAdmin = false;          // admin flag
let customerProfile = null;   // {id, business_name, dto_vol, ...}
const cart = [];              // [{ productId: uuidString, qtyCajas }]

// Entrega desde DB (slots 1..25)
let deliveryChoice = { slot: '', label: '' };

let sortMode = 'category'; // category | bestsellers | price_desc | price_asc

// Filtros UI (DESKTOP / estado aplicado)
let filterAll = true;                 // "Todos" ON por default
let filterCats = new Set();           // acumulativo
let searchTerm = '';                  // buscador

// ===== Mobile Filters (pendientes) =====
let pendingFilterAll = true;
let pendingFilterCats = new Set();

/***********************
 * DOM HELPERS
 ***********************/
function $(id) { return document.getElementById(id); }

function formatMoney(n) {
  return Math.round(Number(n || 0)).toLocaleString('es-AR');
}

function headerTwoLine(text) {
  const parts = String(text || '').trim().split(/\s+/);
  if (parts.length >= 2) {
    return `<span class="split-2line">${parts[0]}<br>${parts.slice(1).join(' ')}</span>`;
  }
  return String(text || '');
}

function splitTwoWords(text) {
  const parts = String(text || '').trim().split(/\s+/);
  if (parts.length === 2) {
    return `<span class="split-2line">${parts[0]}<br>${parts[1]}</span>`;
  }
  return String(text || '');
}

function setOrderStatus(message, type = '') {
  const el = $('orderStatus');
  if (!el) return;
  el.classList.remove('ok', 'err');
  if (type) el.classList.add(type);
  el.textContent = message || '';
}

/***********************
 * MOBILE MENU
 ***********************/
function toggleMobileMenu(forceOpen) {
  const menu = $('mobileMenu');
  const btn = $('hamburgerBtn');
  if (!menu || !btn) return;

  const willOpen = (typeof forceOpen === 'boolean') ? forceOpen : !menu.classList.contains('open');
  menu.classList.toggle('open', willOpen);
  menu.setAttribute('aria-hidden', willOpen ? 'false' : 'true');
  btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
}

function closeMobileMenu() {
  toggleMobileMenu(false);
}

/***********************
 * SECTIONS
 ***********************/
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');

  closeCategoriesMenu();
  closeUserMenu();
  closeMobileMenu();
  closeFiltersOverlay();
}

function goToProductsTop() {
  showSection('productos');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/***********************
 * CUIT -> EMAIL INTERNO
 ***********************/
function normalizeCUIT(cuit) {
  return String(cuit || '').trim().replace(/\s+/g, '');
}
function cuitDigits(cuit) {
  return normalizeCUIT(cuit).replace(/\D/g, '');
}
function cuitToInternalEmail(cuit) {
  const digits = cuitDigits(cuit);
  if (!digits) return '';
  return `${digits}@cuit.loekemeyer`;
}

/***********************
 * LOGIN MODAL
 ***********************/
function openLogin() {
  setOrderStatus('');
  const err = $('loginError');
  if (err) {
    err.style.display = 'none';
    err.innerText = '';
  }
  $('loginModal')?.classList.add('open');
  $('loginModal')?.setAttribute('aria-hidden', 'false');
}

function closeLogin() {
  $('loginModal')?.classList.remove('open');
  $('loginModal')?.setAttribute('aria-hidden', 'true');
}

async function login() {
  const cuit = ($('cuitInput')?.value || '').trim();
  const password = ($('passInput')?.value || '').trim();

  if (!cuit || !password) {
    const err = $('loginError');
    if (err) { err.innerText = 'Completá CUIT y contraseña.'; err.style.display = 'block'; }
    return;
  }

  const email = cuitToInternalEmail(cuit);
  if (!email) {
    const err = $('loginError');
    if (err) { err.innerText = 'CUIT inválido.'; err.style.display = 'block'; }
    return;
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    const err = $('loginError');
    if (err) { err.innerText = 'CUIT o contraseña incorrectos.'; err.style.display = 'block'; }
    return;
  }

  currentSession = data.session || null;
  closeLogin();

  // limpiar búsqueda
  searchTerm = '';
  const ns = $('navSearch');
  if (ns) ns.value = '';

  await refreshAuthState();
  await loadProductsFromDB();
  renderCategoriesMenu();
  renderCategoriesSidebar();
  renderProducts();
  updateCart();
  syncPaymentButtons();
}

/***********************
 * LOGOUT
 ***********************/
async function logout() {
  if (window.__isLoggingOut) return;
  window.__isLoggingOut = true;

  try {
    const signOutPromise = supabaseClient.auth.signOut().catch(() => {});
    await Promise.race([signOutPromise, new Promise(r => setTimeout(r, 1200))]);

    Object.keys(localStorage)
      .filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
      .forEach(k => localStorage.removeItem(k));

    Object.keys(sessionStorage)
      .filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
      .forEach(k => sessionStorage.removeItem(k));

    currentSession = null;
    isAdmin = false;
    customerProfile = null;
    deliveryChoice = { slot: '', label: '' };

    if ($('customerNote')) $('customerNote').innerText = '';
    if ($('helloNavBtn')) $('helloNavBtn').innerText = '';
    if ($('loginBtn')) $('loginBtn').style.display = 'inline';
    if ($('userBox')) $('userBox').style.display = 'none';
    closeUserMenu();

    resetShippingSelect();

    // reset filtros
    filterAll = true;
    filterCats.clear();
    searchTerm = '';
    setSearchInputValue('');

    renderCategoriesMenu();
    renderCategoriesSidebar();
    renderProducts();
    updateCart();
    showSection('productos');

    setTimeout(() => location.reload(), 50);

  } catch (e) {
    console.error('logout error:', e);
    setOrderStatus('No se pudo cerrar sesión. Probá recargando la página.', 'err');
    window.__isLoggingOut = false;
  }
}

/***********************
 * AUTH/PROFILE HELPERS
 ***********************/
async function refreshAuthState() {
  const { data } = await supabaseClient.auth.getSession();
  currentSession = data.session || null;

  if (!currentSession) {
    isAdmin = false;
    customerProfile = null;
    deliveryChoice = { slot: '', label: '' };

    if ($('loginBtn')) $('loginBtn').style.display = 'inline';
    if ($('userBox')) $('userBox').style.display = 'none';
    if ($('ctaCliente')) $('ctaCliente').style.display = 'inline-flex';
    if ($('helloNavBtn')) $('helloNavBtn').innerText = '';
    if ($('customerNote')) $('customerNote').innerText = '';
    if ($('menuMyOrders')) $('menuMyOrders').style.display = 'none';

    const ml = $('mobileLogin');
    const mo = $('mobileMyOrders');
    const mlo = $('mobileLogout');
    if (ml) ml.style.display = 'block';
    if (mo) mo.style.display = 'none';
    if (mlo) mlo.style.display = 'none';

    resetShippingSelect();
    return;
  }

  const { data: adminRow, error: adminErr } = await supabaseClient
    .from('admins')
    .select('auth_user_id')
    .eq('auth_user_id', currentSession.user.id)
    .maybeSingle();

  isAdmin = !!adminRow && !adminErr;

  const { data: custRow } = await supabaseClient
    .from('customers')
    .select('id,business_name,dto_vol,cod_cliente,cuit,direccion_fiscal,localidad,expreso,mail')
    .eq('auth_user_id', currentSession.user.id)
    .maybeSingle();

  customerProfile = custRow || null;

  const hasSession = !!currentSession;
  const ml = $('mobileLogin');
  const mo = $('mobileMyOrders');
  const mlo = $('mobileLogout');
  if (ml) ml.style.display = hasSession ? 'none' : 'block';
  if (mo) mo.style.display = hasSession ? 'block' : 'none';
  if (mlo) mlo.style.display = hasSession ? 'block' : 'none';

  if ($('loginBtn')) $('loginBtn').style.display = 'none';
  if ($('userBox')) $('userBox').style.display = 'inline-flex';
  if ($('ctaCliente')) $('ctaCliente').style.display = 'none';

  const name = (customerProfile?.business_name || '').trim();
  if ($('helloNavBtn')) $('helloNavBtn').innerText = name ? `Hola, ${name} !` : 'Hola!';

  if ($('menuMyOrders')) $('menuMyOrders').style.display = isAdmin ? 'none' : 'block';

  const note = $('customerNote');
  if (note) {
    if (!currentSession) note.innerText = '';
    else if (isAdmin) note.innerText = 'Modo Administrador';
    else note.innerText = 'Ya está aplicado tu Dto x Volumen';
  }

  await loadDeliveryOptions();
}

function getDtoVol() {
  if (isAdmin) return 0;
  return Number(customerProfile?.dto_vol || 0);
}
function unitYourPrice(listPrice) {
  const dto = getDtoVol();
  return Number(listPrice || 0) * (1 - dto);
}

/***********************
 * MÉTODO DE PAGO
 ***********************/
function getPaymentDiscount() {
  const sel = $('paymentSelect');
  if (!sel) return 0;
  const v = parseFloat(sel.value);
  return isNaN(v) ? 0 : v;
}

function getPaymentMethodText() {
  const sel = $('paymentSelect');
  if (!sel) return '';
  const opt = sel.options[sel.selectedIndex];
  return (opt && opt.textContent) ? opt.textContent.trim() : '';
}

function setPaymentByValue(val) {
  const sel = $('paymentSelect');
  if (!sel) return;
  sel.value = String(val);
  syncPaymentButtons();
  updateCart();
}

function syncPaymentButtons() {
  const sel = $('paymentSelect');
  const wrap = $('paymentButtons');
  if (!sel || !wrap) return;

  const current = String(sel.value);
  wrap.querySelectorAll('.pay-btn').forEach(btn => {
    btn.classList.toggle('active', String(btn.dataset.value) === current);
  });
}

/***********************
 * PRODUCTS (DB/RPC)
 ***********************/
async function loadProductsFromDB() {
  const logged = !!currentSession;

  if (!logged) {
    const { data, error } = await supabaseClient.rpc('get_products_public');
    if (error) {
      console.error('Error loading public products:', error);
      products = [];
      return;
    }

    products = (data || []).map(p => ({
      id: p.id,
      cod: p.cod,
      category: p.category || 'Sin categoría',
      subcategory: p.subcategory,
      ranking: (p.ranking === null || p.ranking === undefined || p.ranking === '') ? null : Number(p.ranking),
      orden_catalogo: (p.orden_catalogo === null || p.orden_catalogo === undefined || p.orden_catalogo === '') ? null : Number(p.orden_catalogo),
      description: p.description,
      list_price: null,
      uxb: p.uxb,
      images: Array.isArray(p.images) ? p.images : []
    }));
    return;
  }

  const { data, error } = await supabaseClient
    .from('products')
    .select('id,cod,category,subcategory,ranking,orden_catalogo,description,list_price,uxb,images,active')
    .eq('active', true)
    .order('category', { ascending: true })
    .order('orden_catalogo', { ascending: true, nullsFirst: false })
    .order('description', { ascending: true });

  if (error) {
    console.error('Error loading products:', error);
    products = [];
    return;
  }

  products = (data || []).map(p => ({
    id: p.id,
    cod: p.cod,
    category: p.category || 'Sin categoría',
    subcategory: (p.subcategory && String(p.subcategory).trim()) ? String(p.subcategory).trim() : null,
    ranking: (p.ranking === null || p.ranking === undefined || p.ranking === '') ? null : Number(p.ranking),
    orden_catalogo: (p.orden_catalogo === null || p.orden_catalogo === undefined || p.orden_catalogo === '') ? null : Number(p.orden_catalogo),
    description: p.description,
    list_price: p.list_price,
    uxb: p.uxb,
    images: Array.isArray(p.images) ? p.images : [],
    active: !!p.active
  }));
}

/***********************
 * CATEGORÍAS HELPERS (orden fijo + fallback)
 ***********************/
function getOrderedCategoriesFrom(list) {
  const presentCats = new Set(
    list.map(p => String(p.category || '').trim()).filter(Boolean)
  );

  // primero las del orden fijo que estén presentes
  const inOrder = CATEGORY_ORDER.filter(cat => presentCats.has(cat));

  // extras (categorías nuevas no contempladas)
  const extras = Array.from(presentCats)
    .filter(cat => !CATEGORY_ORDER.includes(cat))
    .sort((a, b) => a.localeCompare(b, 'es'));

  return [...inOrder, ...extras];
}

function slugifyCategory(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]/g, '');
}

function normalizeText(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function getSortComparator() {
  return (a, b) => {
    const aOrd = (a.orden_catalogo === null || a.orden_catalogo === undefined) ? 999999 : Number(a.orden_catalogo);
    const bOrd = (b.orden_catalogo === null || b.orden_catalogo === undefined) ? 999999 : Number(b.orden_catalogo);

    const aRank = (a.ranking === null || a.ranking === undefined) ? 999999 : Number(a.ranking);
    const bRank = (b.ranking === null || b.ranking === undefined) ? 999999 : Number(b.ranking);

    const aPrice = (a.list_price === null || a.list_price === undefined) ? -1 : Number(a.list_price);
    const bPrice = (b.list_price === null || b.list_price === undefined) ? -1 : Number(b.list_price);

    if (sortMode === 'bestsellers') {
      return (aRank - bRank) || (aOrd - bOrd) || String(a.description||'').localeCompare(String(b.description||''), 'es');
    }

    if (sortMode === 'price_desc') {
      return (bPrice - aPrice) || (aOrd - bOrd) || String(a.description||'').localeCompare(String(b.description||''), 'es');
    }

    if (sortMode === 'price_asc') {
      const aP = aPrice < 0 ? 999999999 : aPrice;
      const bP = bPrice < 0 ? 999999999 : bPrice;
      return (aP - bP) || (aOrd - bOrd) || String(a.description||'').localeCompare(String(b.description||''), 'es');
    }

    return (aOrd - bOrd) || String(a.description||'').localeCompare(String(b.description||''), 'es');
  };
}

/***********************
 * DROPDOWN CATEGORÍAS (desktop)
 ***********************/
function closeCategoriesMenu() {
  const menu = $('categoriesMenu');
  if (menu) menu.classList.remove('open');
}

function toggleCategoriesMenu() {
  const menu = $('categoriesMenu');
  if (!menu) return;
  const open = menu.classList.contains('open');
  closeUserMenu();
  menu.classList.toggle('open', !open);
}

function renderCategoriesMenu() {
  const menu = $('categoriesMenu');
  if (!menu) return;

  const ordered = getOrderedCategoriesFrom(products);

  menu.innerHTML = `
    <div>
      <label class="dd-toggle-row dd-chip">
        <span>Todos los artículos</span>
        <input type="checkbox" id="ddToggleAll" ${filterAll ? 'checked' : ''}>
      </label>

      <div class="dd-sep"></div>

      <div class="dd-cats-grid">
        ${ordered.map(cat => `
          <label class="dd-chip">
            <span>${cat}</span>
            <input
              type="checkbox"
              class="dd-toggle-cat"
              data-cat="${cat}"
              ${filterCats.has(cat) ? 'checked' : ''}
            >
          </label>
        `).join('')}
      </div>
    </div>
  `;

  const ddAll = $('ddToggleAll');
  if (ddAll) {
    ddAll.addEventListener('change', () => {
      filterAll = ddAll.checked;
      if (filterAll) filterCats.clear();
      if (!filterAll && filterCats.size === 0) filterAll = true;

      renderCategoriesMenu();
      renderCategoriesSidebar();
      renderProducts();
    });
  }

  menu.querySelectorAll('.dd-toggle-cat').forEach(inp => {
    inp.addEventListener('change', () => {
      const cat = inp.dataset.cat;
      if (inp.checked) filterCats.add(cat);
      else filterCats.delete(cat);

      if (filterCats.size > 0) filterAll = false;
      if (filterCats.size === 0) filterAll = true;

      renderCategoriesMenu();
      renderCategoriesSidebar();
      renderProducts();
    });
  });
}

/***********************
 * SIDEBAR CATEGORÍAS (desktop)
 ***********************/
function renderCategoriesSidebar() {
  const list = $('categoriesSidebarList');
  if (!list) return;

  const ordered = getOrderedCategoriesFrom(products);

  list.innerHTML = `
    <label class="toggle-row ${filterAll ? 'active' : ''}">
      <span class="toggle-text">Todos los artículos</span>
      <input type="checkbox" id="toggleAll" ${filterAll ? 'checked' : ''}>
      <span class="toggle-ui"></span>
    </label>

    <div class="toggle-sep"></div>

    ${ordered.map(cat => `
      <label class="toggle-row ${filterCats.has(cat) ? 'active' : ''}">
        <span class="toggle-text">${cat}</span>
        <input type="checkbox" class="toggle-cat" data-cat="${cat}" ${filterCats.has(cat) ? 'checked' : ''}>
        <span class="toggle-ui"></span>
      </label>
    `).join('')}
  `;

  const all = $('toggleAll');
  if (all) {
    all.addEventListener('change', () => {
      filterAll = all.checked;
      if (filterAll) filterCats.clear();
      if (!filterAll && filterCats.size === 0) filterAll = true;

      renderCategoriesSidebar();
      renderCategoriesMenu?.();
      renderProducts();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  list.querySelectorAll('.toggle-cat').forEach(inp => {
    inp.addEventListener('change', () => {
      const cat = inp.dataset.cat;

      if (inp.checked) filterCats.add(cat);
      else filterCats.delete(cat);

      if (filterCats.size > 0) filterAll = false;
      if (filterCats.size === 0) filterAll = true;

      renderCategoriesSidebar();
      renderCategoriesMenu?.();
      renderProducts();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

/***********************
 * USER MENU
 ***********************/
function closeUserMenu() {
  const menu = $('userMenu');
  if (menu) menu.classList.remove('open');
}

function toggleUserMenu() {
  const menu = $('userMenu');
  if (!menu) return;
  const open = menu.classList.contains('open');
  closeCategoriesMenu();
  menu.classList.toggle('open', !open);
}

/***********************
 * BUSCADOR
 ***********************/
function setSearchInputValue(val) {
  const inp = $('productsSearch');
  if (inp) inp.value = val || '';
}

function getFilteredProducts() {
  // 1) Si hay búsqueda: GLOBAL (ignora toggles)
  if (searchTerm && String(searchTerm).trim()) {
    const term = String(searchTerm)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    return products.filter(p => {
      const hay = [
        p.cod,
        p.description
      ]
        .map(x =>
          String(x || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
        )
        .join(' ');

      return hay.includes(term);
    });
  }

  // 2) Sin búsqueda: respeta toggles
  let list = products.slice();

  if (!filterAll) {
    list = list.filter(p => filterCats.has(String(p.category || '').trim()));
  }

  return list;
}

/***********************
 * RENDER PRODUCTS
 ***********************/
function renderProducts() {
  const container = $('productsContainer');
  if (!container) return;

  container.innerHTML = '';

  const logged = !!currentSession;

  let list = (typeof getFilteredProducts === 'function') ? getFilteredProducts() : products;

  if (!list.length) {
    container.innerHTML = `
      <div style="padding:24px 40px; color:#666; font-size:14px;">
        Sin resultados${(typeof searchTerm === 'string' && searchTerm.trim()) ? ` para "${String(searchTerm).trim()}"` : ''}.
      </div>
    `;
    return;
  }

  const cats = getOrderedCategoriesFrom(list);

  const buildCard = (p) => {
    const pid = String(p.id);
    const codSafe = String(p.cod || '').trim();
    const imgSrc = `${BASE_IMG}${encodeURIComponent(codSafe)}.jpg?v=${encodeURIComponent(IMG_VERSION)}`;
    const imgFallback = "img/no-image.jpg";
    const tuPrecio = logged ? unitYourPrice(p.list_price) : 0;

    const isNuevo = (p.ranking === null || p.ranking === undefined || String(p.ranking).trim() === '');

    const inCart = cart.find(i => String(i.productId) === String(pid));
    const qty = inCart ? Number(inCart.qtyCajas || 0) : 0;
    const totalUni = qty * Number(p.uxb || 0);

    return `
      <div class="product-card" id="card-${pid}">
        ${isNuevo ? `<div class="badge-nuevo">NUEVO</div>` : ``}

        <img id="img-${pid}"
             src="${imgSrc}"
             alt="${String(p.description || '')}"
             onerror="this.onerror=null;this.src='${imgFallback}'">

        <div class="product-info">
          <div class="product-cod">Cod: <span>${codSafe}</span></div>
          <div class="product-name">${String(p.description || '')}</div>

          <div class="${logged ? '' : 'price-hidden'}">
            Precio Lista: <span>$${formatMoney(p.list_price)}</span><br>
            Tu Precio: <span>$${formatMoney(tuPrecio)}</span><br>
            UxB: <span>${p.uxb}</span>
          </div>

          <div class="${logged ? 'price-hidden' : ''}">
            <div class="price-locked">Inicia sesión para ver precios</div>
            UxB: <span>${p.uxb}</span>
          </div>
        </div>

        ${qty <= 0 ? `
          <button class="add-btn" id="add-${pid}" onclick="addFirstBox('${pid}')">
            Agregar al pedido
          </button>
        ` : `
          <div class="qty-panel" id="qty-${pid}">
            <div class="qty-row">
              <span class="qty-label">Cajas</span>

              <div class="qty-stepper">
                <button type="button" class="qty-btn" onclick="changeQty('${pid}', -1)">−</button>
                <input class="qty-input" type="number" min="1" step="1" value="${qty}"
                       inputmode="numeric"
                       onchange="manualQty('${pid}', this.value)">
                <button type="button" class="qty-btn" onclick="changeQty('${pid}', 1)">+</button>
              </div>
            </div>

            <div class="qty-meta">
              <span>UxB: <strong>${p.uxb}</strong></span>
              <span>Unidades: <strong>${formatMoney(totalUni)}</strong></span>
            </div>

            <div class="qty-chips">
              <button type="button" class="chip" onclick="changeQty('${pid}', 5)">+5</button>
              <button type="button" class="chip" onclick="changeQty('${pid}', 10)">+10</button>
            </div>

            <div class="qty-actions">
              <button type="button" class="go-cart-btn" onclick="showSection('carrito')">
                Ver pedido (${qty})
              </button>

              <button type="button" class="remove-btn" onclick="removeItem('${pid}')">
                Quitar
              </button>
            </div>
          </div>
        `}
      </div>
    `;
  };

  // 🔥 Más vendidos: ranking global, pero respeta filtros aplicados (list)
  if (sortMode === 'bestsellers') {
    const items = [...list].sort((a, b) => {
      const ar = (a.ranking == null || String(a.ranking).trim() === '') ? 999999 : Number(a.ranking);
      const br = (b.ranking == null || String(b.ranking).trim() === '') ? 999999 : Number(b.ranking);
      return (ar - br) || String(a.description||'').localeCompare(String(b.description||''), 'es');
    });

    container.innerHTML = `
      <div class="products-grid">
        ${items.map(buildCard).join('')}
      </div>
    `;
    return;
  }

  // Normal: por categorías
  cats.forEach(category => {
    const block = document.createElement('div');
    block.className = 'category-block';
    const catId = `cat-${slugifyCategory(category)}`;

    const items = list
      .filter(p => String(p.category || '').trim() === String(category).trim())
      .sort(getSortComparator());

    if (!items.length) return;

    let cardsHtml = '';

    if (String(category).trim().toLowerCase() === 'utensilios') {
      const groups = new Map();

      items.forEach(p => {
        const key = (p.subcategory && String(p.subcategory).trim())
          ? String(p.subcategory).trim()
          : 'Otros';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p);
      });

      const present = Array.from(groups.keys());
      const fixed = UTENSILIOS_SUB_ORDER.filter(s => present.includes(s));
      const extras = present
        .filter(s => s !== 'Otros' && !UTENSILIOS_SUB_ORDER.includes(s))
        .sort((a, b) => a.localeCompare(b, 'es'));
      const hasOtros = present.includes('Otros');
      const subcatsOrdered = [...fixed, ...extras, ...(hasOtros ? ['Otros'] : [])];

      cardsHtml = subcatsOrdered.map(sub => {
        const prods = groups.get(sub) || [];
        prods.sort(getSortComparator());

        const subtitle = `
          <div style="
            grid-column: 1 / -1;
            font-size: 26px;
            font-weight: bold;
            margin: 40px 40px 20px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 6px;
            background: #fff;
          ">${sub}</div>
        `;

        const cards = prods.map(buildCard).join('');
        return subtitle + cards;
      }).join('');
    } else {
      cardsHtml = items.map(buildCard).join('');
    }

    block.innerHTML = `
      <h2 class="category-title" id="${catId}">${category}</h2>
      <div class="products-grid">
        ${cardsHtml}
      </div>
    `;

    container.appendChild(block);
  });

  if (!container.children.length) {
    container.innerHTML = `
      <div style="padding:24px 40px; color:#666; font-size:14px;">
        Sin resultados${(typeof searchTerm === 'string' && searchTerm.trim()) ? ` para "${String(searchTerm).trim()}"` : ''}.
      </div>
    `;
  }
}

/***********************
 * MOBILE FILTERS OVERLAY (PENDIENTE + APLICAR)
 *
 * Requiere estos IDs en tu HTML (solo en mobile):
 * - openFiltersBtn (botón al lado de Ordenar por)
 * - filtersOverlay (overlay)
 * - filtersGrid (contenedor de botones 2 columnas)
 * - filtersApplyBtn
 * - filtersCancelBtn
 ***********************/
function openFiltersOverlay(){
  const ov = $('filtersOverlay');
  if (!ov) return;

  // arranca siempre desde el estado aplicado actual
  pendingFilterAll = filterAll;
  pendingFilterCats = new Set(filterCats);

  renderFiltersOverlayUI();

  ov.classList.add('open');
  ov.setAttribute('aria-hidden', 'false');
}

function closeFiltersOverlay(){
  const ov = $('filtersOverlay');
  if (!ov) return;
  ov.classList.remove('open');
  ov.setAttribute('aria-hidden', 'true');
}

function applyPendingFilters(){
  filterAll = pendingFilterAll;
  filterCats = new Set(pendingFilterCats);

  // sync UIs desktop
  renderCategoriesMenu();
  renderCategoriesSidebar();

  renderProducts();
  closeFiltersOverlay();
}

function cancelPendingFilters(){
  closeFiltersOverlay();
}

function renderFiltersOverlayUI(){
  const grid = $('filtersGrid');
  if (!grid) return;

  const ordered = getOrderedCategoriesFrom(products);

  // helper: devuelve true si una cat está activa en “pendiente”
  const isOn = (cat) => pendingFilterCats.has(cat);

  // armado grid 2 columnas (botones “toggle” visuales)
  grid.innerHTML = `
    <button type="button"
      class="mf-btn ${pendingFilterAll ? 'on' : ''}"
      data-all="1">Todos los artículos</button>
    ${ordered.map(cat => `
      <button type="button"
        class="mf-btn ${isOn(cat) ? 'on' : ''}"
        data-cat="${cat}">${cat}</button>
    `).join('')}
  `;

  // clicks
  grid.querySelectorAll('.mf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const isAll = btn.dataset.all === '1';
      const cat = btn.dataset.cat;

      if (isAll) {
        pendingFilterAll = true;
        pendingFilterCats.clear();
      } else {
        // al tocar una categoría, se apaga “todos”
        pendingFilterAll = false;
        if (pendingFilterCats.has(cat)) pendingFilterCats.delete(cat);
        else pendingFilterCats.add(cat);

        if (pendingFilterCats.size === 0) {
          pendingFilterAll = true;
        }
      }

      // re-render para reflejar “on/off”
      renderFiltersOverlayUI();
    });
  });
}

/***********************
 * DELIVERY OPTIONS (DB)
 ***********************/
function resetShippingSelect() {
  const sel = $('shippingSelect');
  if (!sel) return;
  sel.innerHTML = `<option value="" selected>Elegir</option>`;
  deliveryChoice = { slot: '', label: '' };
}

async function loadDeliveryOptions() {
  const sel = $('shippingSelect');
  if (!sel) return;

  resetShippingSelect();
  if (!currentSession || !customerProfile?.id) return;

  const { data, error } = await supabaseClient
    .from('customer_delivery_addresses')
    .select('slot,label')
    .eq('customer_id', customerProfile.id)
    .order('slot', { ascending: true });

  if (error) {
    console.error('delivery options error:', error);
    return;
  }

  (data || []).forEach(row => {
    const opt = document.createElement('option');
    opt.value = String(row.slot);
    opt.textContent = `${row.slot}: ${row.label}`;
    opt.dataset.label = row.label || '';
    sel.appendChild(opt);
  });

  updateCart();
}

/***********************
 * CART
 ***********************/
function addFirstBox(productId) {
  if (!currentSession) { openLogin(); return; }

  const existing = cart.find(i => i.productId === productId);
  if (existing) existing.qtyCajas += 1;
  else {
    cart.push({ productId, qtyCajas: 1 });
    toggleControls(productId, true);
  }
  updateCart();
  renderProducts();
}

function changeQty(productId, delta) {
  const item = cart.find(i => i.productId === productId);
  if (!item) return;

  item.qtyCajas += delta;
  if (item.qtyCajas <= 0) { removeItem(productId); return; }

  const input = document.querySelector(`#qty-${CSS.escape(productId)} input`);
  if (input) input.value = item.qtyCajas;

  updateCart();
  renderProducts();
}

function manualQty(productId, value) {
  const qty = Math.max(0, parseInt(value, 10) || 0);
  const item = cart.find(i => i.productId === productId);
  if (!item) return;

  if (qty <= 0) { removeItem(productId); return; }

  item.qtyCajas = qty;
  updateCart();
  renderProducts();
}

function removeItem(productId) {
  const idx = cart.findIndex(i => i.productId === productId);
  if (idx >= 0) cart.splice(idx, 1);
  toggleControls(productId, false);
  updateCart();
  renderProducts();
}

function toggleControls(productId, show) {
  const addBtn = $(`add-${productId}`);
  const qtyWrap = $(`qty-${productId}`);
  if (addBtn) addBtn.style.display = show ? 'none' : 'inline-block';
  if (qtyWrap) qtyWrap.style.display = show ? 'block' : 'none';
}

function calcTotals() {
  const logged = !!currentSession;
  const paymentDiscount = getPaymentDiscount();

  let subtotal = 0;
  if (logged) {
    cart.forEach(item => {
      const p = products.find(x => String(x.id) === String(item.productId));
      if (!p) return;
      const totalUni = item.qtyCajas * Number(p.uxb || 0);
      subtotal += unitYourPrice(p.list_price) * totalUni;
    });
  }

  let totalNoDiscount = 0;
  cart.forEach(item => {
    const p = products.find(x => String(x.id) === String(item.productId));
    if (!p) return;
    const totalUni = item.qtyCajas * Number(p.uxb || 0);
    totalNoDiscount += Number(p.list_price || 0) * totalUni;
  });

  const webDiscountValue = subtotal * WEB_ORDER_DISCOUNT;
  const afterWeb = subtotal - webDiscountValue;

  const paymentDiscountValue = afterWeb * paymentDiscount;
  const finalTotal = afterWeb - paymentDiscountValue;

  const totalDiscounts = Math.max(0, totalNoDiscount - finalTotal);

  return {
    logged,
    paymentDiscount,
    subtotal,
    totalNoDiscount,
    webDiscountValue,
    paymentDiscountValue,
    finalTotal,
    totalDiscounts
  };
}

function updateCart() {
  const cartDiv = $('cart');
  if (!cartDiv) return;

  const t = calcTotals();

  if (!cart.length) {
    cartDiv.innerHTML = `<div style="padding:14px; text-align:center; color:#666;">Carrito vacío</div>`;
  } else {
    let rows = '';

    cart.forEach(item => {
      const p = products.find(x => String(x.id) === String(item.productId));
      if (!p) return;

      const totalCajas = item.qtyCajas;
      const totalUni = totalCajas * Number(p.uxb || 0);

      const tuPrecioUnit = t.logged ? unitYourPrice(p.list_price) : 0;
      const lineTotal = t.logged ? (tuPrecioUnit * totalUni) : 0;

      rows += `
        <tr>
          <td><strong>${String(p.cod || '')}</strong></td>
          <td class="desc">${splitTwoWords(p.description)}</td>
          <td>${formatMoney(totalCajas)}</td>
          <td>${formatMoney(totalUni)}</td>
          <td>${t.logged ? ('$' + formatMoney(tuPrecioUnit)) : '—'}</td>
          <td><strong>${t.logged ? ('$' + formatMoney(lineTotal)) : '—'}</strong></td>
        </tr>
      `;
    });

    cartDiv.innerHTML = `
      <table class="cart-table">
        <colgroup>
          <col class="cod">
          <col class="desc">
          <col class="cajas">
          <col class="uni">
          <col class="tp">
          <col class="total">
        </colgroup>
        <thead>
          <tr>
            <th>${headerTwoLine('Cod')}</th>
            <th>${headerTwoLine('Descripción')}</th>
            <th>${headerTwoLine('Total Cajas')}</th>
            <th>${headerTwoLine('Total Uni')}</th>
            <th>${headerTwoLine('Tu Precio')}</th>
            <th>${headerTwoLine('Total $')}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  $('subtotal') && ($('subtotal').innerText = formatMoney(t.subtotal));
  $('webDiscountValue') && ($('webDiscountValue').innerText = formatMoney(t.webDiscountValue));
  $('paymentDiscountValue') && ($('paymentDiscountValue').innerText = formatMoney(t.paymentDiscountValue));
  $('total') && ($('total').innerText = formatMoney(t.finalTotal));
  if ($('pedidoTotalHeader')) $('pedidoTotalHeader').innerText = formatMoney(t.finalTotal);
  if ($('paymentDiscountPercent')) $('paymentDiscountPercent').innerText = (t.paymentDiscount * 100).toFixed(0) + '%';
  $('totalNoDiscount') && ($('totalNoDiscount').innerText = formatMoney(t.totalNoDiscount));
  $('totalDiscounts') && ($('totalDiscounts').innerText = formatMoney(t.totalDiscounts));

  let count = 0;
  cart.forEach(i => count += i.qtyCajas);
  $('cartCount') && ($('cartCount').innerText = count);

  const btn = $('submitOrderBtn');
  if (btn) {
    const mustChooseDelivery = !deliveryChoice.slot;
    const canConfirm = !!currentSession && cart.length > 0 && !mustChooseDelivery;
    btn.disabled = !canConfirm;

    if (!!currentSession && cart.length > 0 && mustChooseDelivery) {
      setOrderStatus('Elegí una opción de Entrega para poder confirmar el pedido.', 'err');
    } else if (btn.disabled === false) {
      setOrderStatus('');
    }
  }
}

/***********************
 * SUBMIT ORDER
 ***********************/
async function submitOrder() {
  try {
    setOrderStatus('');

    if (!currentSession) { openLogin(); return; }
    if (isAdmin) { setOrderStatus('Modo Administrador: no se puede confirmar pedidos desde esta vista.', 'err'); return; }
    if (!customerProfile?.id) { setOrderStatus('No se encontró el perfil del cliente.', 'err'); return; }
    if (!cart.length) { setOrderStatus('Carrito vacío.', 'err'); return; }
    if (!deliveryChoice.slot) { setOrderStatus('Elegí una opción de Entrega para poder confirmar el pedido.', 'err'); return; }

    const btn = $('submitOrderBtn');
    if (btn) btn.disabled = true;
    setOrderStatus('Confirmando pedido…', '');

    const t = calcTotals();

    const orderPayload = {
      customer_id: customerProfile.id,
      delivery_slot: Number(deliveryChoice.slot),
      delivery_label: String(deliveryChoice.label || '').trim() || `Entrega ${deliveryChoice.slot}`,
      dto_vol: Number(customerProfile.dto_vol || 0),
      web_discount: WEB_ORDER_DISCOUNT,
      payment_discount: Number(t.paymentDiscount || 0),
      payment_method: getPaymentMethodText(),

      subtotal: Number(t.subtotal || 0),
      total_no_discount: Number(t.totalNoDiscount || 0),
      web_discount_value: Number(t.webDiscountValue || 0),
      payment_discount_value: Number(t.paymentDiscountValue || 0),
      total: Number(t.finalTotal || 0),
      total_discounts: Number(t.totalDiscounts || 0),
    };

    const { data: orderRow, error: orderErr } = await supabaseClient
      .from('orders')
      .insert(orderPayload)
      .select('id')
      .single();

    if (orderErr || !orderRow?.id) {
      console.error('order insert error:', orderErr);
      setOrderStatus('No se pudo confirmar el pedido (cabecera).', 'err');
      if (btn) btn.disabled = false;
      return;
    }

    const orderId = orderRow.id;

    // ✅ FIX: acá NO existe "list" => usar products
    const itemsPayload = cart.map(item => {
      const p = products.find(x => String(x.id) === String(item.productId));
      if (!p) return null;

      const qtyCajas = Number(item.qtyCajas || 0);
      const uxb = Number(p.uxb || 0);
      const qtyUni = qtyCajas * uxb;

      const unitList = Number(p.list_price || 0);
      const unitYour = Number(unitYourPrice(p.list_price) || 0);
      const lineTotal = unitYour * qtyUni;

      return {
        order_id: orderId,
        product_id: p.id,
        cod: String(p.cod || ''),
        description: String(p.description || ''),
        uxb,
        qty_cajas: qtyCajas,
        qty_uni: qtyUni,
        unit_list_price: unitList,
        unit_your_price: unitYour,
        line_total: lineTotal
      };
    }).filter(Boolean);

    const { error: itemsErr } = await supabaseClient
      .from('order_items')
      .insert(itemsPayload);

    if (itemsErr) {
      console.error('items insert error:', itemsErr);
      setOrderStatus('Pedido creado pero fallaron los renglones. Avisá a administración.', 'err');
      if (btn) btn.disabled = false;
      return;
    }

    cart.splice(0, cart.length);
    products.forEach(p => toggleControls(String(p.id), false));

    updateCart();
    setOrderStatus(`Pedido confirmado. N°: ${orderId.slice(0, 8).toUpperCase()}`, 'ok');

  } catch (e) {
    console.error('submitOrder fatal:', e);
    setOrderStatus('Error inesperado confirmando el pedido.', 'err');
  } finally {
    const btn = $('submitOrderBtn');
    if (btn) btn.disabled = false;
  }
}

/***********************
 * MIS PEDIDOS (placeholder)
 ***********************/
async function openMyOrders() {
  setOrderStatus('Mis pedidos todavía no está disponible.', 'err');
  showSection('productos');
}

/***********************
 * INIT
 ***********************/
(async function init() {
  // Exponer funciones al HTML (onclick)
  window.showSection = showSection;
  window.goToProductsTop = goToProductsTop;

  window.openLogin = openLogin;
  window.closeLogin = closeLogin;
  window.login = login;
  window.logout = logout;

  window.addFirstBox = addFirstBox;
  window.changeQty = changeQty;
  window.manualQty = manualQty;
  window.updateCart = updateCart;

  window.submitOrder = submitOrder;
  window.openMyOrders = openMyOrders;

  function formatCUITLive(value) {
    const d = String(value || '').replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`;
    return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
  }

  const cuitEl = $('cuitInput');
  if (cuitEl) {
    cuitEl.addEventListener('input', (e) => {
      const el = e.target;
      const start = el.selectionStart;
      const before = el.value;

      el.value = formatCUITLive(el.value);

      const diff = el.value.length - before.length;
      const next = (start ?? el.value.length) + diff;
      el.setSelectionRange(next, next);
    });
  }

  $('categoriesBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleCategoriesMenu();
  });

  $('profileBtn')?.addEventListener('click', (e) => { e.preventDefault(); toggleUserMenu(); });
  $('helloNavBtn')?.addEventListener('click', (e) => { e.preventDefault(); toggleUserMenu(); });

  const sortSel = $('sortSelect');
  if (sortSel) {
    sortSel.addEventListener('change', () => {
      sortMode = sortSel.value || 'category';
      renderProducts();
    });
  }

  $('paymentButtons')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.pay-btn');
    if (!btn) return;
    setPaymentByValue(btn.dataset.value);
  });

  $('paymentSelect')?.addEventListener('change', () => {
    syncPaymentButtons();
    updateCart();
  });

  const shipSel = $('shippingSelect');
  if (shipSel) {
    deliveryChoice = { slot: shipSel.value || '', label: '' };
    shipSel.addEventListener('change', () => {
      const opt = shipSel.options[shipSel.selectedIndex];
      deliveryChoice.slot = shipSel.value || '';
      deliveryChoice.label = opt?.dataset?.label || opt?.textContent || '';
      updateCart();
    });
  }

  document.addEventListener('click', (e) => {
    const catBtn = $('categoriesBtn');
    const catMenu = $('categoriesMenu');
    const profileBtn = $('profileBtn');
    const helloBtn = $('helloNavBtn');
    const userMenu = $('userMenu');

    const clickInsideCat =
      (catBtn && catBtn.contains(e.target)) ||
      (catMenu && catMenu.contains(e.target));

    const clickInsideUser =
      (profileBtn && profileBtn.contains(e.target)) ||
      (helloBtn && helloBtn.contains(e.target)) ||
      (userMenu && userMenu.contains(e.target));

    if (!clickInsideCat) closeCategoriesMenu();
    if (!clickInsideUser) closeUserMenu();
  });

  // Buscador NAV (global)
  const navSearch = $('navSearch');
  if (navSearch) {
    navSearch.addEventListener('input', () => {
      searchTerm = String(navSearch.value || '').trim();
      renderProducts();
    });
  }

  $('hamburgerBtn')?.addEventListener('click', () => { toggleMobileMenu(); });

  document.addEventListener('click', (e) => {
    const menu = $('mobileMenu');
    const btn = $('hamburgerBtn');
    if (!menu || !btn) return;
    const clickedInside = menu.contains(e.target) || btn.contains(e.target);
    if (!clickedInside) closeMobileMenu();
  });

  // ✅ Mobile filtros: abrir/cerrar/aplicar/cancelar
  $('openFiltersBtn')?.addEventListener('click', () => openFiltersOverlay());
  $('filtersCancelBtn')?.addEventListener('click', () => cancelPendingFilters());
  $('filtersApplyBtn')?.addEventListener('click', () => applyPendingFilters());

  $('filtersOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'filtersOverlay') closeFiltersOverlay();
  });

  // Cargar sesión inicial
  const { data } = await supabaseClient.auth.getSession();
  currentSession = data.session || null;

  await refreshAuthState();
  await loadProductsFromDB();

  renderCategoriesMenu();
  renderCategoriesSidebar();
  renderProducts();
  updateCart();
  syncPaymentButtons();

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    currentSession = session;

    // limpiar búsqueda
    searchTerm = '';
    const ns = $('navSearch');
    if (ns) ns.value = '';

    await refreshAuthState();
    await loadProductsFromDB();

    renderCategoriesMenu();
    closeCategoriesMenu();
    renderCategoriesSidebar();
    renderProducts();

    updateCart();
    syncPaymentButtons();
  });
})();
