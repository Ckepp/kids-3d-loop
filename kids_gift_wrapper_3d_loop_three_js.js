(function (global) {
  'use strict';

  // Capture current <script> element so data-target / data-manual / data-transparent work automatically
  const currentScript = typeof document !== 'undefined' ? document.currentScript : null;
  const THREE_R128_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

  // ============================================================================
  // 1. CONSTANTS & 1000x1000 ARTWORK-TO-3D COORDINATE TRANSFORMS
  // ============================================================================
// ... existing code ...
  // ============================================================================
  // 7. SCENE INITIALIZATION & 10-SECOND HARMONIC ANIMATION LOOP
  // ============================================================================
  function initKidsGiftWrapperLoop(container, options = {}) {
    try {
      const THREE = global.THREE;
      if (!THREE) {
        throw new Error('Three.js r128 must be loaded before initializing KidsGiftWrapperLoop.');
      }

      const targetEl =
        typeof container === 'string'
          ? document.querySelector(container)
          : container || document.body;

      if (!targetEl) {
        throw new Error('Target container element for KIDS Gift Wrapper 3D Loop was not found.');
      }

      const useTransparentBg = Boolean(
        options.transparent || targetEl.getAttribute('data-transparent') === 'true'
      );

      // 1. Scene & Pure-White Studio Backdrop (or Transparent Overlay Mode)
      const scene = new THREE.Scene();
      if (!useTransparentBg) {
        scene.background = new THREE.Color(0xffffff);
        scene.fog = new THREE.Fog(0xffffff, 18, 42);
      }

      // 2. Camera & Renderer
      const width = targetEl.clientWidth || window.innerWidth;
      const height = targetEl.clientHeight || window.innerHeight;

      const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
      camera.position.set(0, 0.45, 10.6);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: useTransparentBg,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance'
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      targetEl.appendChild(renderer.domElement);

      // 3. OrbitControls (uses THREE.OrbitControls if loaded, or built-in drag-orbit fallback)
      let controls;
      if (typeof THREE.OrbitControls === 'function') {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, -0.05, 0);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.minDistance = 4.5;
        controls.maxDistance = 20.0;
        controls.update();
      } else {
        const orbitTarget = new THREE.Vector3(0, -0.05, 0);
        const spherical = new THREE.Spherical().setFromVector3(
          camera.position.clone().sub(orbitTarget)
        );
        let dragging = false;
        let prevX = 0;
        let prevY = 0;

        renderer.domElement.addEventListener('pointerdown', (e) => {
          dragging = true;
          prevX = e.clientX;
          prevY = e.clientY;
        });
        window.addEventListener('pointermove', (e) => {
          if (!dragging) return;
          spherical.theta -= (e.clientX - prevX) * 0.008;
          spherical.phi = Math.max(
            0.35,
            Math.min(Math.PI - 0.35, spherical.phi - (e.clientY - prevY) * 0.008)
          );
          prevX = e.clientX;
          prevY = e.clientY;
        });
        window.addEventListener('pointerup', () => {
          dragging = false;
        });

        controls = {
          target: orbitTarget,
          update() {
            camera.position.setFromSpherical(spherical).add(orbitTarget);
            camera.lookAt(orbitTarget);
          }
        };
      }

      // 4. Studio Environment & Three-Point + Quadrant Accent Lighting