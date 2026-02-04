/***********************
 * script.js (corregido)
 * - Orden fijo de categorías + subcategorías (Utensilios)
 * - Sidebar con toggles (acumulativos) + "Todos los artículos" ON por default
 * - Dropdown Categorías con el mismo comportamiento (sync)
 * - Buscador arriba a la derecha (filtra dentro de lo visible por toggles)
 ***********************/
'use strict';

/***********************
 * SUPABASE CONFIG
 ***********************/
const SUPABASE_URL = "https://kwkclwhmoygunqmlegrg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3a2Nsd2htb3lndW5xbWxlZ3JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MjA2NzUsImV4cCI6MjA4NTA5NjY3NX0.soqPY5hfA3RkAJ9jmIms8UtEGUc4WpZztpEbmDijOgU"; // <-- dejá tu key real
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/***********************
 * UI CONSTANTS
 ***********************/
const WEB_ORDER_DISCOUNT = 0.025; // 2.5% siempre
const BASE_IMG = `${SUPABASE_URL}/storage/v1/object/public/products-images/`;
const IMG_VERSION = "2026-02-04"; // cambiá esto cuando actualices imágenes

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

// Filtros UI
let filterAll = true;                 // "Todos" ON por default
let filterCats = new Set();           // acumulativo
let searchTerm = '';                  // buscador

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

  const name = (customerProfile?.business_name || '').trim();
  if ($('helloNavBtn')) $('helloNavBtn').innerText = name ? `Hola, ${name} !` : 'Hola!';

  if ($('menuMyOrders')) $('menuMyOrders').style.display = isAdmin ? 'none' : 'block';

  if ($('customerNote')) {
    if (isAdmin) $('customerNote').innerText = 'Modo Administrador';
    else $('customerNote').innerText = 'Ya está aplicado tu Dto x Volumen';
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
      subcategory: p.subcategory || null,
      ranking: Number(p.ranking ?? 999999),
      description: p.description,
      list_price: null,
      uxb: p.uxb,
      images: Array.isArray(p.images) ? p.images : [],
      active: !!p.active
    }));
    return;
  }

  const { data, error } = await supabaseClient
    .from('products')
    .select('id,cod,category,subcategory,ranking,description,list_price,uxb,images,active')
    .eq('active', true)
    .order('category', { ascending: true })
    .order('ranking', { ascending: true })
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
    subcategory: p.subcategory || null,
    ranking: Number(p.ranking ?? 999999),
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
  const cats = [...new Set(list.map(p => String(p.category || '').trim()).filter(Boolean))];

  const ordered = [
    ...CATEGORY_ORDER.filter(c => cats.includes(c)),
    ...cats.filter(c => !CATEGORY_ORDER.includes(c)).sort((a, b) => a.localeCompare(b, 'es'))
  ];
  return ordered;
}

function slugifyCategory(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]/g, '');
}

/***********************
 * DROPDOWN CATEGORÍAS (con toggles, sync con sidebar)
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

  // UI (checkbox toggles)
  menu.innerHTML = `
    <div style="padding:6px;">
      <label class="dd-toggle-row">
        <span>Todos los artículos</span>
        <input type="checkbox" id="ddToggleAll" ${filterAll ? 'checked' : ''}>
      </label>
      <div class="dd-sep"></div>
      ${ordered.map(cat => `
        <label class="dd-toggle-row">
          <span>${cat}</span>
          <input type="checkbox" class="dd-toggle-cat" data-cat="${cat}" ${filterCats.has(cat) ? 'checked' : ''}>
        </label>
      `).join('')}
    </div>
  `;

  // events
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
 * SIDEBAR CATEGORÍAS (toggles)
 ***********************/
function renderCategoriesSidebar() {
  const list = $('categoriesSidebarList');
  if (!list) return;

  const ordered = getOrderedCategoriesFrom(products);

  list.innerHTML = `
    <!-- BUSCADOR en el sidebar -->
    <div style="margin-bottom:10px;">
      <input
        id="sidebarSearch"
        type="search"
        placeholder="Buscar productos…"
        value="${String(searchTerm || '').replace(/"/g, '&quot;')}"
        style="
          width:100%;
          height:34px;
          border-radius:10px;
          border:1px solid #ddd;
          background:#fff;
          color:#111;
          padding:0 10px;
          outline:none;
          font-size:13px;
        "
      />
    </div>

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

  // Buscar (global): al tipear, filtra productos
  const s = $('sidebarSearch');
  if (s) {
    s.addEventListener('input', () => {
      searchTerm = String(s.value || '').trim();
      renderProducts();
      // opcional: si querés que el dropdown también refleje el estado, descomentá:
      // renderCategoriesMenu();
    });
  }

  // Toggles (igual que antes)
  const all = $('toggleAll');
  if (all) {
    all.addEventListener('change', () => {
      filterAll = all.checked;
      if (filterAll) filterCats.clear();
      if (!filterAll && filterCats.size === 0) filterAll = true;

      renderCategoriesSidebar();
      renderCategoriesMenu?.(); // si existe
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
      renderCategoriesMenu?.(); // si existe
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
 * BUSCADOR (arriba derecha, sin tocar HTML)
 ***********************/
function ensureSearchUI() {
  const navRight = document.querySelector('.nav-right');
  if (!navRight) return;

  // si ya existe, no recrear
  if (document.getElementById('productsSearch')) return;

  const wrap = document.createElement('div');
  wrap.style.display = 'inline-flex';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '8px';

  const input = document.createElement('input');
  input.id = 'productsSearch';
  input.type = 'search';
  input.placeholder = 'Buscar…';
  input.autocomplete = 'off';

  // estilo inline para que quede prolijo sin tocar CSS
  input.style.height = '34px';
  input.style.width = '220px';
  input.style.borderRadius = '10px';
  input.style.border = '1px solid rgba(255,255,255,0.25)';
  input.style.background = 'rgba(255,255,255,0.08)';
  input.style.color = '#fff';
  input.style.padding = '0 10px';
  input.style.outline = 'none';
  input.style.fontSize = '13px';

  input.addEventListener('input', () => {
    searchTerm = String(input.value || '').trim();
    renderProducts();
  });

  wrap.appendChild(input);

  // insertar antes de loginBtn (o al final si no está)
  const loginBtn = $('loginBtn');
  if (loginBtn && loginBtn.parentElement === navRight) {
    navRight.insertBefore(wrap, loginBtn);
  } else {
    navRight.insertBefore(wrap, navRight.firstChild);
  }
}

function setSearchInputValue(val) {
  const inp = $('productsSearch');
  if (inp) inp.value = val || '';
}

function matchesSearch(p, term) {
  if (!term) return true;
  const t = term.toLowerCase();

  const haystack = [
    p.cod,
    p.description,
    p.category,
    p.subcategory
  ].map(x => String(x || '').toLowerCase()).join(' ');

  return haystack.includes(t);
}

/***********************
 * FILTRO GLOBAL A PRODUCTOS (toggles + search)
 ***********************/
function getFilteredProducts() {
  // 1) Si hay búsqueda: GLOBAL (ignora toggles)
  if (searchTerm && String(searchTerm).trim()) {
    const term = String(searchTerm).trim().toLowerCase();
    return products.filter(p => {
      const hay = [
        p.cod,
        p.description,
        p.category,
        p.subcategory
      ].map(x => String(x || '').toLowerCase()).join(' ');
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
 * RENDER PRODUCTS (orden fijo + Utensilios suborden fijo)
 ***********************/
function renderProducts() {
  const container = $('productsContainer');
  if (!container) return;

  container.innerHTML = '';

  const logged = !!currentSession;

  // base filtrada (por toggles + search)
  const filtered = getFilteredProducts();

  // categorías a mostrar en este momento (según filtros)
  const orderedCategories = getOrderedCategoriesFrom(filtered);

  const buildCard = (p) => {
    const pid = String(p.id);
    const codSafe = String(p.cod || '').trim();
    const imgSrc = `${BASE_IMG}${encodeURIComponent(codSafe)}.jpg?v=${IMG_VERSION}`;
    const imgFallback = `https://picsum.photos/300?random=${encodeURIComponent(codSafe || '0')}`;
    const tuPrecio = logged ? unitYourPrice(p.list_price) : 0;

    return `
      <div class="product-card" id="card-${pid}">
        <img id="img-${pid}"
             src="${imgSrc}"
             alt="${String(p.description || '')}"
             onerror="this.onerror=null;this.src='${imgFallback}'">

        <div class="product-info">
          <div class="product-name">${String(p.description || '')}</div>
          Cod: <span>${codSafe}</span><br>


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

        <button class="add-btn" id="add-${pid}" onclick="addFirstBox('${pid}')">
          Agregar al pedido
        </button>

        <div class="qty-wrapper" id="qty-${pid}">
          <div class="qty-controls">
            <button type="button" onclick="changeQty('${pid}', -1)">−</button>
            <input type="number" value="1" min="1" onchange="manualQty('${pid}', this.value)">
            <button type="button" onclick="changeQty('${pid}', 1)">+</button>
          </div>

          <div class="quick-buttons">
            <button type="button" onclick="changeQty('${pid}', 5)">+5</button>
            <button type="button" onclick="changeQty('${pid}', 10)">+10</button>
          </div>
        </div>
      </div>
    `;
  };

  // Render categorías
  orderedCategories.forEach(category => {
    const block = document.createElement('div');
    block.className = 'category-block';
    const catId = `cat-${slugifyCategory(category)}`;

    const items = filtered
      .filter(p => String(p.category || '').trim() === category)
      .sort((a, b) => (a.ranking ?? 999999) - (b.ranking ?? 999999));

    if (!items.length) return;

    let cardsHtml = '';

    // SOLO Utensilios: subtítulos dentro de la MISMA grilla, orden fijo
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

        prods.sort((a, b) =>
          ((a.ranking ?? 999999) - (b.ranking ?? 999999)) ||
          String(a.description || '').localeCompare(String(b.description || ''), 'es')
        );

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

  // Si no hay resultados
  if (!container.children.length) {
    container.innerHTML = `
      <div style="padding:24px 40px; color:#666; font-size:14px;">
        Sin resultados para "${String(searchTerm || '').trim()}".
      </div>
    `;
  }
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
}

function changeQty(productId, delta) {
  const item = cart.find(i => i.productId === productId);
  if (!item) return;

  item.qtyCajas += delta;
  if (item.qtyCajas <= 0) { removeItem(productId); return; }

  const input = document.querySelector(`#qty-${CSS.escape(productId)} input`);
  if (input) input.value = item.qtyCajas;

  updateCart();
}

function manualQty(productId, value) {
  const qty = Math.max(0, parseInt(value, 10) || 0);
  const item = cart.find(i => i.productId === productId);
  if (!item) return;

  if (qty <= 0) { removeItem(productId); return; }

  item.qtyCajas = qty;
  updateCart();
}

function removeItem(productId) {
  const idx = cart.findIndex(i => i.productId === productId);
  if (idx >= 0) cart.splice(idx, 1);
  toggleControls(productId, false);
  updateCart();
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

  // UI buscador
  // ensureSearchUI();

  // Categorías dropdown
  $('categoriesBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleCategoriesMenu();
  });

  // User menu
  $('profileBtn')?.addEventListener('click', (e) => { e.preventDefault(); toggleUserMenu(); });
  $('helloNavBtn')?.addEventListener('click', (e) => { e.preventDefault(); toggleUserMenu(); });

  // Pago: botones -> select
  $('paymentButtons')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.pay-btn');
    if (!btn) return;
    setPaymentByValue(btn.dataset.value);
  });

  $('paymentSelect')?.addEventListener('change', () => {
    syncPaymentButtons();
    updateCart();
  });

  // Entrega
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

  // Click afuera: cerrar dropdowns y user menu
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

  
  // Hamburger
  $('hamburgerBtn')?.addEventListener('click', () => { toggleMobileMenu(); });

  // Cerrar menú mobile al tocar fuera
  document.addEventListener('click', (e) => {
    const menu = $('mobileMenu');
    const btn = $('hamburgerBtn');
    if (!menu || !btn) return;
    const clickedInside = menu.contains(e.target) || btn.contains(e.target);
    if (!clickedInside) closeMobileMenu();
  });

  // Cargar sesión inicial
  const { data } = await supabaseClient.auth.getSession();
  currentSession = data.session || null;

  await refreshAuthState();
  await loadProductsFromDB();

  // Menús + render
  renderCategoriesMenu();
  renderCategoriesSidebar();
  renderProducts();
  updateCart();
  syncPaymentButtons();

  // Reaccionar a cambios auth
  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    currentSession = session;
    await refreshAuthState();
    await loadProductsFromDB();

    renderCategoriesMenu();
    renderCategoriesSidebar();
    renderProducts();

    updateCart();
    syncPaymentButtons();
  });
})();
