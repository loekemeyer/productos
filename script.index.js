document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btnMayorista");
  if (!btn) return;

  // Ir directo a la tienda (sin pantalla "en desarrollo")
  btn.addEventListener("click", () => {
    window.location.href = "mayorista.html";
  });
});

function initClientesBounce() {
  const wrap = document.getElementById("clientesBounce");
  const track = document.getElementById("clientesTrack");
  if (!wrap || !track) return;

  const computeShift = () => {
    const wrapW = wrap.clientWidth;
    const trackW = track.scrollWidth;

    // cuánto puede moverse sin “vaciar” el carrusel
    const shift = Math.max(0, trackW - wrapW);

    // setea variable CSS para el keyframe
    track.style.setProperty("--clientes-shift", `${shift}px`);

    // si no hay nada que mover, frenamos animación
    track.style.animationPlayState = shift === 0 ? "paused" : "running";
  };

  // esperar a que carguen las imágenes (si no, el ancho da mal)
  const imgs = Array.from(track.querySelectorAll("img"));
  let pending = imgs.length;

  if (pending === 0) {
    computeShift();
    return;
  }

  const done = () => {
    pending--;
    if (pending <= 0) computeShift();
  };

  imgs.forEach(img => {
    if (img.complete) return done();
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  });

  window.addEventListener("resize", () => {
    // micro-debounce
    clearTimeout(window.__clientesResizeT);
    window.__clientesResizeT = setTimeout(computeShift, 120);
  });
}

document.addEventListener("DOMContentLoaded", initClientesBounce);


function initLegalModals(){
  const modal = document.getElementById("legalModal");
  if (!modal) return;

  const titleEl = document.getElementById("legalTitle");
  const contentEl = document.getElementById("legalContent");
  const closeBtn = modal.querySelector(".modal-close");

  const CONTENT = {
    privacy: {
      title: "Política de privacidad",
      html: "<p>test</p>"
    },
    terms: {
      title: "Términos y condiciones",
      html: "<p>test</p>"
    }
  };

  function openModal(key){
    const data = CONTENT[key];
    if (!data) return;

    titleEl.textContent = data.title;
    contentEl.innerHTML = data.html;

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal(){
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  document.querySelectorAll(".footer-link[data-modal]").forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      openModal(a.dataset.modal);
    });
  });

  closeBtn?.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) closeModal();
  });
}

document.addEventListener("DOMContentLoaded", initLegalModals);
