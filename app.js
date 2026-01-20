import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

const hint = document.getElementById("hint");
const startBtn = document.getElementById("start");

let renderer, scene, camera;
let session, refSpace, viewerSpace, hitTestSource;
let reticle, model, placed = false;

startBtn.addEventListener("click", startAR);

async function startAR() {
  if (!navigator.xr) {
    hint.textContent = "WebXR нет. Открой в Chrome на Android.";
    return;
  }
  const ok = await navigator.xr.isSessionSupported("immersive-ar");
  if (!ok) {
    hint.textContent = "AR WebXR недоступен на этом устройстве/браузере.";
    return;
  }

  // Three.js
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));

  // Ретикл (куда можно поставить)
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.10, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // Загрузка модели
  const loader = new GLTFLoader();
  model = await new Promise((resolve, reject) => {
    loader.load("./models/mcdonalds_lunch.glb", (gltf) => {
      const obj = gltf.scene;
      obj.visible = false;
      obj.scale.setScalar(1.0); // тут подгоняешь размер
      scene.add(obj);
      resolve(obj);
    }, undefined, reject);
  });

  // Запуск AR (тут будет запрос камеры)
  session = await navigator.xr.requestSession("immersive-ar", {
    requiredFeatures: ["hit-test"],
    optionalFeatures: ["dom-overlay"],
    domOverlay: { root: document.body },
  });

  renderer.xr.setSession(session);
  refSpace = await session.requestReferenceSpace("local");
  viewerSpace = await session.requestReferenceSpace("viewer");
  hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

  hint.textContent = "Наведи на стол. Тапни по экрану, чтобы поставить.";
  startBtn.style.display = "none";

  // Тап по экрану = поставить модель
  window.addEventListener("click", placeOnce, { once: false });

  session.addEventListener("end", () => {
    hint.textContent = "AR завершён.";
    startBtn.style.display = "block";
    placed = false;
    if (renderer?.domElement) renderer.domElement.remove();
  });

  renderer.setAnimationLoop((t, frame) => {
    if (frame && !placed) {
      const hits = frame.getHitTestResults(hitTestSource);
      if (hits.length) {
        const pose = hits[0].getPose(refSpace);
        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);
        model.visible = true;
      } else {
        reticle.visible = false;
      }
    }
    renderer.render(scene, camera);
  });
}

function placeOnce() {
  if (!model || !reticle.visible || placed) return;
  model.position.setFromMatrixPosition(reticle.matrix);
  model.quaternion.setFromRotationMatrix(reticle.matrix);
  placed = true;
  reticle.visible = false;
  hint.textContent = "Готово! Двигайся вокруг.";
}
