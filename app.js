import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("start");
const hint = document.getElementById("hint");

let renderer, scene, camera;
let session, refSpace, viewerSpace, hitTestSource;
let reticle, model;
let placed = false;

startBtn.addEventListener("click", startFlow);

async function startFlow() {
  // iOS fallback (пока простой): показываем сообщение
  // (прод-версия: редирект на USDZ / Quick Look)
  const ua = navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  if (isIOS) {
    alert("iPhone doesn’t support WebXR immersive AR in Safari. Use an iOS fallback (USDZ/Quick Look).");
    return;
  }

  if (!navigator.xr) {
    alert("WebXR is not available. Open this page in Google Chrome on Android.");
    return;
  }

  const supported = await navigator.xr.isSessionSupported("immersive-ar");
  if (!supported) {
    alert("Immersive AR not supported on this device/browser (needs ARCore + Chrome).");
    return;
  }

  // --- THREE ---
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));

  // reticle (куда можно поставить)
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.10, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // load model
  model = await loadGLB("./mcdonalds_lunch.glb");
  model.visible = false;
  scene.add(model);

  // Start AR session (тут и будет запрос камеры)
  session = await navigator.xr.requestSession("immersive-ar", {
    requiredFeatures: ["hit-test"],
    optionalFeatures: ["dom-overlay"],
    domOverlay: { root: document.body },
  });

  renderer.xr.setSession(session);

  refSpace = await session.requestReferenceSpace("local");
  viewerSpace = await session.requestReferenceSpace("viewer");
  hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

  overlay.style.display = "none";
  hint.style.display = "block";
  hint.textContent = "Move your phone slowly to find a table surface…";

  // Tap anywhere to place (как “instant” UX)
  window.addEventListener("click", placeOnTap);

  session.addEventListener("end", cleanup);

  renderer.setAnimationLoop((t, frame) => {
    if (frame && !placed) {
      const hits = frame.getHitTestResults(hitTestSource);
      if (hits.length) {
        const pose = hits[0].getPose(refSpace);
        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);
        model.visible = true;
        hint.textContent = "Tap to place the dish.";
      } else {
        reticle.visible = false;
      }
    }
    renderer.render(scene, camera);
  });
}

function placeOnTap() {
  if (!model || !reticle?.visible || placed) return;

  model.position.setFromMatrixPosition(reticle.matrix);
  model.quaternion.setFromRotationMatrix(reticle.matrix);

  // Если размер не совпадает — подгони тут (MVP)
  // model.scale.setScalar(0.8);

  placed = true;
  reticle.visible = false;
  hint.textContent = "Placed! Walk around it.";
}

async function loadGLB(url) {
  const loader = new GLTFLoader();
  return await new Promise((resolve, reject) => {
    loader.load(url, (gltf) => {
      const obj = gltf.scene;
      // Нормальный pivot снизу лучше сделать в Blender, но для MVP так:
      obj.scale.setScalar(1.0);
      resolve(obj);
    }, undefined, reject);
  });
}

function cleanup() {
  placed = false;
  hint.style.display = "none";
  overlay.style.display = "grid";

  try { hitTestSource = null; } catch {}
  try { session = null; } catch {}

  if (renderer?.domElement) renderer.domElement.remove();
  renderer?.setAnimationLoop(null);
  renderer = null;
}
