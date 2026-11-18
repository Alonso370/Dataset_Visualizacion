// Recorrido guiado: cada paso elige una captura y marca una zona de la pantalla
const pasos = [...document.querySelectorAll(".step")];
const imagenes = [...document.querySelectorAll("#stage img")];
const foco = document.getElementById("focus");
const puntos = document.getElementById("dots");

pasos.forEach(() => puntos.appendChild(document.createElement("li")));

function activar(paso) {
  const i = pasos.indexOf(paso);
  pasos.forEach((p, j) => p.classList.toggle("on", j === i));
  [...puntos.children].forEach((p, j) => p.classList.toggle("on", j === i));
  imagenes.forEach(img => img.classList.toggle("on", img.dataset.name === paso.dataset.img));

  // data-box guarda x, y, ancho y alto en % de la captura
  const zona = paso.dataset.box ? paso.dataset.box.split(",") : null;
  foco.classList.toggle("on", Boolean(zona));
  if (zona) {
    foco.style.left = `${zona[0]}%`;
    foco.style.top = `${zona[1]}%`;
    foco.style.width = `${zona[2]}%`;
    foco.style.height = `${zona[3]}%`;
  }
}

const observador = new IntersectionObserver(
  entradas => entradas.filter(e => e.isIntersecting).forEach(e => activar(e.target)),
  { rootMargin: "-48% 0px -48% 0px" }
);

pasos.forEach(p => observador.observe(p));
activar(pasos[0]);
