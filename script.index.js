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
