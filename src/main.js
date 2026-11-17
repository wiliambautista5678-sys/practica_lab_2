import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as LocAR from "locar";

// Coordenada del Laboratorio de Redes
const TARGET = {
  lat: -2.299114,
  lon: -78.118125,
  name: "LABORATORIO DE REDES"
};

const canvas = document.getElementById("ar");
const startBtn = document.getElementById("startBtn");
const info = document.getElementById("info");

let locar = null;
let iniciado = false;
let gpsInicializado = false;

function setInfo(html) {
  info.innerHTML = html;
}

function makeBox(color, size = 4) {
  const geometry = new THREE.BoxGeometry(size, size, size);
  const material = new THREE.MeshBasicMaterial({ color });
  return new THREE.Mesh(geometry, material);
}

// Calcula un punto desplazado cierta distancia y rumbo desde una coordenada.
function destinationPoint(lat, lon, distanceMeters, bearingDegrees) {
  const R = 6371000;
  const bearing = bearingDegrees * Math.PI / 180;
  const lat1 = lat * Math.PI / 180;
  const lon1 = lon * Math.PI / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceMeters / R) +
    Math.cos(lat1) * Math.sin(distanceMeters / R) * Math.cos(bearing)
  );

  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(distanceMeters / R) * Math.cos(lat1),
    Math.cos(distanceMeters / R) - Math.sin(lat1) * Math.sin(lat2)
  );

  return {
    lat: lat2 * 180 / Math.PI,
    lon: ((lon2 * 180 / Math.PI + 540) % 360) - 180
  };
}

// Distancia aproximada entre dos coordenadas.
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Cubos de calibración a 50 m alrededor del usuario.
function agregarCubosOrientacion(lat, lon) {
  const distancia = 50;

  const definiciones = [
    { color: 0xff0000, rumbo: 0,   nombre: "Norte"  }, // rojo
    { color: 0xffff00, rumbo: 180, nombre: "Sur"    }, // amarillo
    { color: 0x00ffff, rumbo: 270, nombre: "Oeste"  }, // celeste
    { color: 0x00ff00, rumbo: 90,  nombre: "Este"   }  // verde
  ];

  definiciones.forEach((def) => {
    const punto = destinationPoint(lat, lon, distancia, def.rumbo);
    const cubo = makeBox(def.color, 6);
    locar.add(cubo, punto.lon, punto.lat, 2);
    console.log(`Cubo ${def.nombre} agregado a 50 m`);
  });
}

// Carga router.glb y lo coloca en la coordenada del laboratorio.
// Si falla, coloca un cubo magenta de respaldo.
function agregarModeloLaboratorio() {
  const loader = new GLTFLoader();

  loader.load(
    "/models/router.glb",
    function (gltf) {
      const router = gltf.scene;

      // Ajusta tamaño según tu modelo.
      router.scale.set(5, 5, 5);

      // Para girarlo 90° en Y si aparece mirando hacia atrás:
      // router.rotation.set(0, THREE.MathUtils.degToRad(90), 0);
      router.rotation.set(0, 0, 0);

      locar.add(
        router,
        TARGET.lon,
        TARGET.lat,
        5 // elevación
      );

      console.log("Router cargado correctamente");
    },
    function (progress) {
      console.log("Cargando router...");
    },
    function (error) {
      console.error("Error al cargar router:", error);

      // Respaldo para no romper la práctica si falta el GLB.
      const respaldo = makeBox(0xff00ff, 12);
      locar.add(respaldo, TARGET.lon, TARGET.lat, 6);
      console.warn("Se usó cubo magenta de respaldo. Coloca /models/router.glb");
    }
  );
}

async function startAR() {
  if (iniciado) return;

  iniciado = true;
  startBtn.disabled = true;
  setInfo("Iniciando cámara, sensores y GPS...");

  try {
    const app = new LocAR.App({
      canvas,
      cameraOptions: {
        hFov: 80,
        near: 0.001,
        far: 1500
      }
    });

    locar = await app.start();

    // Activa el GPS.
    locar.startGps();

    // Cada actualización de GPS.
    locar.on("gpsupdate", (ev) => {
      const coords = ev.position.coords;
      const lat = coords.latitude;
      const lon = coords.longitude;
      const precision = coords.accuracy;

      const distancia = haversine(lat, lon, TARGET.lat, TARGET.lon);

      setInfo(
        `GPS: ${lat.toFixed(6)}, ${lon.toFixed(6)}<br>` +
        `Precisión: ${precision.toFixed(0)} m<br>` +
        `Distancia al ${TARGET.name}: ${distancia.toFixed(0)} m<br><br>` +
        `GPS inicial recibido. Gira lentamente 360° y busca los cubos.`
      );

      // Solo agregamos objetos una vez, con la primera posición.
      if (!gpsInicializado) {
        gpsInicializado = true;

        agregarCubosOrientacion(lat, lon);
        agregarModeloLaboratorio();
      }
    });

  } catch (error) {
    console.error(error);
    setInfo("❌ Error al iniciar AR: " + error.message);
    iniciado = false;
    startBtn.disabled = false;
  }
}

startBtn.addEventListener("click", startAR);
