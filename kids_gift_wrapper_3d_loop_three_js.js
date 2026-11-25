(function (global) {
  'use strict';

  const currentScript = typeof document !== 'undefined' ? document.currentScript : null;
  const THREE_R128_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

  // ============================================================================
  // 1. CONSTANTS & 1000x1000 ARTWORK-TO-3D COORDINATE TRANSFORMS
  // ============================================================================
  const LOOP_DURATION = 10.0;
  const TWO_PI = Math.PI * 2;
  const LOGO_SCALE = 0.0056;
  const LOGO_CX = 500;
  const LOGO_CY = 500;

  const toX = (x) => (x - LOGO_CX) * LOGO_SCALE;
  const toY = (y) => -(y - LOGO_CY) * LOGO_SCALE;

  function createPolygonPath(THREE, points2D, isHole, wantClockwise) {
    const vecs = points2D.map(([x, y]) => new THREE.Vector2(toX(x), toY(y)));
    if (THREE.ShapeUtils.isClockWise(vecs) !== wantClockwise) {
      vecs.reverse();
    }
    const path = isHole ? new THREE.Path() : new THREE.Shape();
    for (let i = 0; i < vecs.length; i++) {
      if (i === 0) path.moveTo(vecs[i].x, vecs[i].y);
      else path.lineTo(vecs[i].x, vecs[i].y);
    }
    path.closePath();
    return path;
  }

  function svgPathToThreePath(THREE, d, isHole) {
    const tokens = d.match(/[MLQCZ]|[-+]?(?:\d*\.\d+|\d+)/gi) || [];
    const path = isHole ? new THREE.Path() : new THREE.Shape();
    let i = 0;
    let cmd = '';

    while (i < tokens.length) {
      const token = tokens[i];
      if (/^[MLQCZ]$/i.test(token)) {
        cmd = token.toUpperCase();
        i++;
        if (cmd === 'Z') path.closePath();
        continue;
      }
      if (cmd === 'M') {
        path.moveTo(toX(parseFloat(tokens[i++])), toY(parseFloat(tokens[i++])));
        cmd = 'L';
      } else if (cmd === 'L') {
        path.lineTo(toX(parseFloat(tokens[i++])), toY(parseFloat(tokens[i++])));
      } else if (cmd === 'Q') {
        path.quadraticCurveTo(
          toX(parseFloat(tokens[i++])),
          toY(parseFloat(tokens[i++])),
          toX(parseFloat(tokens[i++])),
          toY(parseFloat(tokens[i++]))
        );
      } else if (cmd === 'C') {
        path.bezierCurveTo(
          toX(parseFloat(tokens[i++])),
          toY(parseFloat(tokens[i++])),
          toX(parseFloat(tokens[i++])),
          toY(parseFloat(tokens[i++])),
          toX(parseFloat(tokens[i++])),
          toY(parseFloat(tokens[i++]))
        );
      } else {
        i++;
      }
    }
    return path;
  }

  // ============================================================================
  // 2. PROCEDURAL SPECULAR SOFTBOX STUDIO ENVIRONMENT & GIFT-WRAP TEXTURE
  // ============================================================================
  function createStudioEnvironment(THREE, renderer) {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0xeef2f7);

    const domeCanvas = document.createElement('canvas');
    domeCanvas.width = 512;
    domeCanvas.height = 256;
    const ctx = domeCanvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, '#dce8fa');
    grad.addColorStop(0.32, '#ffffff');
    grad.addColorStop(0.55, '#eef1f6');
    grad.addColorStop(0.80, '#fffaf2');
    grad.addColorStop(1.0, '#f3ebe0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);

    const domeTex = new THREE.CanvasTexture(domeCanvas);
    domeTex.encoding = THREE.sRGBEncoding;

    const domeGeo = new THREE.SphereGeometry(28, 32, 24);
    const domeMat = new THREE.MeshBasicMaterial({ map: domeTex, side: THREE.BackSide });
    envScene.add(new THREE.Mesh(domeGeo, domeMat));

    const softboxSpecs = [
      { pos: [0, 14, 4], rot: [Math.PI / 2.3, 0, 0], size: [20, 10], color: 0xffffff },
      { pos: [11, 5, 8], rot: [0, -Math.PI / 3, 0], size: [8, 14], color: 0xffffff },
      { pos: [-11, 6, 7], rot: [0, Math.PI / 3, 0], size: [7, 14], color: 0xf4f9ff },
      { pos: [0, 2, 14], rot: [0, Math.PI, 0], size: [12, 4], color: 0xffffff }
    ];

    softboxSpecs.forEach((sb) => {
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(sb.size[0], sb.size[1]),
        new THREE.MeshBasicMaterial({ color: sb.color, side: THREE.DoubleSide })
      );
      panel.position.set(sb.pos[0], sb.pos[1], sb.pos[2]);
      panel.rotation.set(sb.rot[0], sb.rot[1], sb.rot[2]);
      envScene.add(panel);
    });

    const envRT = pmremGenerator.fromScene(envScene, 0.035);
    pmremGenerator.dispose();
    return envRT.texture;
  }

  function createGiftWrapTexture(THREE) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#fffdf8';
    ctx.fillRect(0, 0, 512, 512);

    const stripeSpecs = [
      { offset: 0, width: 34, color: '#d92638' },
      { offset: 44, width: 14, color: '#f1c90e' },
      { offset: 128, width: 24, color: '#ac4190' },
      { offset: 160, width: 10, color: '#f1c90e' },
      { offset: 256, width: 34, color: '#d92638' },
      { offset: 300, width: 14, color: '#f1c90e' },
      { offset: 384, width: 24, color: '#22ac43' },
      { offset: 416, width: 10, color: '#f1c90e' }
    ];

    for (let base = -512; base <= 1024; base += 512) {
      stripeSpecs.forEach((st) => {
        const x0 = base + st.offset;
        ctx.fillStyle = st.color;
        ctx.beginPath();
        ctx.moveTo(x0, 0);
        ctx.lineTo(x0 + st.width, 0);
        ctx.lineTo(x0 + st.width + 512, 512);
        ctx.lineTo(x0 + 512, 512);
        ctx.closePath();
        ctx.fill();
      });
    }

    ctx.fillStyle = '#e5b80b';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const cx = (col * 64 + (row % 2) * 32 + 28) % 512;
        const cy = (row * 64 + 28) % 512;
        ctx.beginPath();
        ctx.arc(cx, cy, 4.2, 0, TWO_PI);
        ctx.fill();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    return tex;
  }

  // ============================================================================
  // 3. FLAT RIBBON GEOMETRY & CURL HELPERS
  // ============================================================================
  function createFlatRibbonGeometry(THREE, curve, segments, width, thickness, normalHint) {
    const points = curve.getSpacedPoints(segments);
    const positions = [];
    const uvs = [];
    const indices = [];

    const tangent = new THREE.Vector3();
    const side = new THREE.Vector3();
    const norm = new THREE.Vector3();
    const fallbackAxis = new THREE.Vector3(1, 0, 0);

    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      curve.getTangentAt(u, tangent).normalize();

      side.crossVectors(tangent, normalHint);
      if (side.lengthSq() < 0.0001) {
        side.crossVectors(tangent, fallbackAxis);
      }
      side.normalize();
      norm.crossVectors(side, tangent).normalize();

      const hw = width * 0.5;
      const ht = thickness * 0.5;
      const p = points[i];

      const c0 = p.clone().addScaledVector(side, hw).addScaledVector(norm, ht);
      const c1 = p.clone().addScaledVector(side, -hw).addScaledVector(norm, ht);
      const c2 = p.clone().addScaledVector(side, -hw).addScaledVector(norm, -ht);
      const c3 = p.clone().addScaledVector(side, hw).addScaledVector(norm, -ht);

      positions.push(
        c0.x, c0.y, c0.z,
        c1.x, c1.y, c1.z,
        c2.x, c2.y, c2.z,
        c3.x, c3.y, c3.z
      );
      uvs.push(
        0, u * 4,
        1, u * 4,
        1, u * 4,
        0, u * 4
      );

      if (i < segments) {
        const base = i * 4;
        const next = (i + 1) * 4;
        indices.push(
          base + 0, next + 0, next + 1, base + 0, next + 1, base + 1,
          base + 1, next + 1, next + 2, base + 1, next + 2, base + 2,
          base + 2, next + 2, next + 3, base + 2, next + 3, base + 3,
          base + 3, next + 3, next + 0, base + 3, next + 0, base + 0
        );
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  function createRibbonCurlGeometry(THREE) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.045, -0.025, 0.015),
      new THREE.Vector3(-0.015, 0.018, -0.015),
      new THREE.Vector3(0.018, -0.015, 0.015),
      new THREE.Vector3(0.045, 0.025, -0.015)
    ]);
    return createFlatRibbonGeometry(THREE, curve, 12, 0.028, 0.005, new THREE.Vector3(0, 0, 1));
  }

  // ============================================================================
  // 4. SCULPTED 3D GIFT BOW & CROSS-WRAP RIBBONS
  // ============================================================================
  function buildSculptedGiftBow(THREE, crimsonMat, goldMat) {
    const bowGroup = new THREE.Group();

    const knotGeo = new THREE.SphereGeometry(0.16, 20, 16);
    knotGeo.scale(1.15, 0.88, 0.95);
    const knot = new THREE.Mesh(knotGeo, crimsonMat);
    knot.castShadow = true;
    bowGroup.add(knot);

    const cinch = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.024, 12, 28), goldMat);
    cinch.rotation.y = Math.PI / 2;
    bowGroup.add(cinch);

    const createBowLoopMesh = (mat, rx, ry, rz, scaleVal) => {
      const loopCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.26, 0.24, 0.08),
        new THREE.Vector3(0.48, 0.14, 0.02),
        new THREE.Vector3(0.36, -0.06, -0.06),
        new THREE.Vector3(0, 0, 0)
      ]);
      const loopGeo = createFlatRibbonGeometry(
        THREE,
        loopCurve,
        32,
        0.21,
        0.02,
        new THREE.Vector3(0, 0, 1)
      );
      const mesh = new THREE.Mesh(loopGeo, mat);
      mesh.rotation.set(rx, ry, rz);
      mesh.scale.setScalar(scaleVal);
      mesh.castShadow = true;
      return mesh;
    };

    bowGroup.add(createBowLoopMesh(crimsonMat, 0.12, 0.18, 0.14, 1.05));
    bowGroup.add(createBowLoopMesh(crimsonMat, 0.12, Math.PI - 0.18, -0.14, 1.05));
    bowGroup.add(createBowLoopMesh(goldMat, -0.18, 0.42, 0.48, 0.82));
    bowGroup.add(createBowLoopMesh(goldMat, -0.18, Math.PI - 0.42, -0.48, 0.82));

    const tailPivots = [];
    [-1, 1].forEach((side) => {
      const tailPivot = new THREE.Group();
      tailPivot.position.set(side * 0.07, -0.04, 0.10);
      bowGroup.add(tailPivot);

      const tailCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(side * 0.16, -0.22, 0.07),
        new THREE.Vector3(side * 0.28, -0.48, 0.04),
        new THREE.Vector3(side * 0.22, -0.72, 0.06)
      ]);
      const tailGeo = createFlatRibbonGeometry(
        THREE,
        tailCurve,
        24,
        0.16,
        0.016,
        new THREE.Vector3(0, 0, 1)
      );
      const tailMesh = new THREE.Mesh(tailGeo, side === -1 ? crimsonMat : goldMat);
      tailMesh.castShadow = true;
      tailPivot.add(tailMesh);
      tailPivots.push({ pivot: tailPivot, side });
    });

    return { bowGroup, tailPivots };
  }

  function buildLogoGiftWrapOverlay(THREE, springRef, interactiveTargets) {
    const wrapRoot = new THREE.Group();

    const crimsonSatinMat = new THREE.MeshPhysicalMaterial({
      color: 0xd92638,
      roughness: 0.18,
      metalness: 0.14,
      clearcoat: 0.82,
      clearcoatRoughness: 0.10,
      reflectivity: 0.92,
      envMapIntensity: 1.30
    });

    const brushedGoldMat = new THREE.MeshPhysicalMaterial({
      color: 0xf1c90e,
      roughness: 0.14,
      metalness: 0.84,
      clearcoat: 0.72,
      clearcoatRoughness: 0.08,
      reflectivity: 0.98,
      envMapIntensity: 1.40
    });

    const vFrontCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.04, -2.07, 0.28),
      new THREE.Vector3(0.04, -2.08, 0.655),
      new THREE.Vector3(0.04, 0.0, 0.665),
      new THREE.Vector3(0.02, 2.04, 0.655),
      new THREE.Vector3(0.02, 2.05, 0.28)
    ]);
    const vBackCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.04, -2.07, 0.28),
      new THREE.Vector3(0.04, -2.08, -0.075),
      new THREE.Vector3(0.04, 0.0, -0.085),
      new THREE.Vector3(0.02, 2.04, -0.075),
      new THREE.Vector3(0.02, 2.05, 0.28)
    ]);
    const hLeftCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.04, 0.02, -0.095),
      new THREE.Vector3(-1.62, 0.02, -0.095),
      new THREE.Vector3(-1.72, 0.02, 0.28),
      new THREE.Vector3(-1.62, 0.02, 0.68),
      new THREE.Vector3(0.04, 0.02, 0.685)
    ]);
    const hRightCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.04, 0.02, -0.095),
      new THREE.Vector3(1.66, 0.02, -0.095),
      new THREE.Vector3(1.76, 0.02, 0.28),
      new THREE.Vector3(1.66, 0.02, 0.68),
      new THREE.Vector3(0.04, 0.02, 0.685)
    ]);

    const RIBBON_SEGS = 64;
    const vFrontGeo = createFlatRibbonGeometry(THREE, vFrontCurve, RIBBON_SEGS, 0.25, 0.022, new THREE.Vector3(1, 0, 0));
    const vBackGeo = createFlatRibbonGeometry(THREE, vBackCurve, RIBBON_SEGS, 0.25, 0.022, new THREE.Vector3(1, 0, 0));
    const hLeftGeo = createFlatRibbonGeometry(THREE, hLeftCurve, RIBBON_SEGS, 0.23, 0.022, new THREE.Vector3(0, 1, 0));
    const hRightGeo = createFlatRibbonGeometry(THREE, hRightCurve, RIBBON_SEGS, 0.23, 0.022, new THREE.Vector3(0, 1, 0));

    const ribbonMeshes = [
      new THREE.Mesh(vFrontGeo, crimsonSatinMat),
      new THREE.Mesh(vBackGeo, crimsonSatinMat),
      new THREE.Mesh(hLeftGeo, brushedGoldMat),
      new THREE.Mesh(hRightGeo, brushedGoldMat)
    ];

    ribbonMeshes.forEach((m) => {
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.spring = springRef;
      wrapRoot.add(m);
      interactiveTargets.push(m);
    });

    const { bowGroup, tailPivots } = buildSculptedGiftBow(THREE, crimsonSatinMat, brushedGoldMat);
    bowGroup.position.set(0.02, 2.13, 0.30);
    bowGroup.rotation.z = THREE.MathUtils.degToRad(1.5);
    wrapRoot.add(bowGroup);

    bowGroup.traverse((child) => {
      if (child.isMesh) {
        child.userData.spring = springRef;
        interactiveTargets.push(child);
      }
    });

    return {
      wrapRoot,
      ribbonGeometries: [vFrontGeo, vBackGeo, hLeftGeo, hRightGeo],
      RIBBON_SEGS,
      bowGroup,
      tailPivots
    };
  }

  // ============================================================================
  // 5. ORBITING 3D GIFT-WRAPPER ROLL & CONTINUOUS UNFURLING 3D WRAPPER SHEET
  // ============================================================================
  function buildOrbitingGiftWrapperSystem(THREE, springRef, interactiveTargets) {
    const systemGroup = new THREE.Group();
    systemGroup.position.y = -0.06;
    systemGroup.rotation.x = 0.18;
    systemGroup.rotation.z = -0.07;

    const wrapTexture = createGiftWrapTexture(THREE);

    const patternMat = new THREE.MeshPhysicalMaterial({
      map: wrapTexture,
      roughness: 0.14,
      metalness: 0.06,
      clearcoat: 0.94,
      clearcoatRoughness: 0.07,
      reflectivity: 0.96,
      envMapIntensity: 1.38
    });

    const goldFoilMat = new THREE.MeshPhysicalMaterial({
      color: 0xf1c90e,
      roughness: 0.13,
      metalness: 0.86,
      clearcoat: 0.72,
      clearcoatRoughness: 0.08,
      reflectivity: 0.98,
      envMapIntensity: 1.42
    });

    const kraftCoreMat = new THREE.MeshStandardMaterial({
      color: 0xc69c6d,
      roughness: 0.78,
      metalness: 0.02,
      side: THREE.DoubleSide
    });

    const crimsonBandMat = new THREE.MeshPhysicalMaterial({
      color: 0xd92638,
      roughness: 0.18,
      metalness: 0.12,
      clearcoat: 0.85,
      clearcoatRoughness: 0.09,
      reflectivity: 0.92,
      envMapIntensity: 1.30
    });

    const rollPivot = new THREE.Group();
    systemGroup.add(rollPivot);

    const rollSpinner = new THREE.Group();
    rollPivot.add(rollSpinner);

    const ROLL_LEN = 1.16;
    const ROLL_OUTER_R = 0.22;
    const ROLL_INNER_R = 0.085;

    const outerCyl = new THREE.Mesh(
      new THREE.CylinderGeometry(ROLL_OUTER_R, ROLL_OUTER_R, ROLL_LEN, 40, 1, true),
      patternMat
    );
    outerCyl.castShadow = true;
    outerCyl.receiveShadow = true;
    rollSpinner.add(outerCyl);

    const innerCore = new THREE.Mesh(
      new THREE.CylinderGeometry(ROLL_INNER_R, ROLL_INNER_R, ROLL_LEN + 0.05, 28, 1, true),
      kraftCoreMat
    );
    rollSpinner.add(innerCore);

    const capGeo = new THREE.RingGeometry(ROLL_INNER_R, ROLL_OUTER_R, 40);
    const topCap = new THREE.Mesh(capGeo, goldFoilMat);
    topCap.rotation.x = -Math.PI / 2;
    topCap.position.y = ROLL_LEN * 0.5;

    const botCap = new THREE.Mesh(capGeo, goldFoilMat);
    botCap.rotation.x = Math.PI / 2;
    botCap.position.y = -ROLL_LEN * 0.5;
    rollSpinner.add(topCap, botCap);

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(ROLL_OUTER_R + 0.008, ROLL_OUTER_R + 0.008, 0.12, 36),
      crimsonBandMat
    );
    const goldTrim = new THREE.Mesh(
      new THREE.CylinderGeometry(ROLL_OUTER_R + 0.011, ROLL_OUTER_R + 0.011, 0.036, 36),
      goldFoilMat
    );
    rollSpinner.add(collar, goldTrim);

    rollPivot.traverse((child) => {
      if (child.isMesh) {
        child.userData.spring = springRef;
        interactiveTargets.push(child);
      }
    });

    const SHEET_SEGS = 92;
    const vertsPerRing = 8;
    const totalVerts = (SHEET_SEGS + 1) * vertsPerRing;
    const positions = new Float32Array(totalVerts * 3);
    const uvs = new Float32Array(totalVerts * 2);

    for (let i = 0; i <= SHEET_SEGS; i++) {
      const u = i / SHEET_SEGS;
      const vCoord = u * 3.5;
      const baseV = i * vertsPerRing;

      uvs[(baseV + 0) * 2 + 0] = 0; uvs[(baseV + 0) * 2 + 1] = vCoord;
      uvs[(baseV + 1) * 2 + 0] = 1; uvs[(baseV + 1) * 2 + 1] = vCoord;
      uvs[(baseV + 2) * 2 + 0] = 0; uvs[(baseV + 2) * 2 + 1] = vCoord;
      uvs[(baseV + 3) * 2 + 0] = 1; uvs[(baseV + 3) * 2 + 1] = vCoord;
      uvs[(baseV + 4) * 2 + 0] = 0; uvs[(baseV + 4) * 2 + 1] = vCoord;
      uvs[(baseV + 5) * 2 + 0] = 1; uvs[(baseV + 5) * 2 + 1] = vCoord;
      uvs[(baseV + 6) * 2 + 0] = 0; uvs[(baseV + 6) * 2 + 1] = vCoord;
      uvs[(baseV + 7) * 2 + 0] = 1; uvs[(baseV + 7) * 2 + 1] = vCoord;
    }

    const topIndices = [];
    const foilIndices = [];

    for (let i = 0; i < SHEET_SEGS; i++) {
      const a = i * vertsPerRing;
      const b = (i + 1) * vertsPerRing;

      topIndices.push(a + 0, b + 0, b + 1, a + 0, b + 1, a + 1);
      foilIndices.push(
        a + 2, a + 3, b + 3, a + 2, b + 3, b + 2,
        a + 4, a + 5, b + 5, a + 4, b + 5, b + 4,
        a + 6, b + 6, b + 7, a + 6, b + 7, a + 7
      );
    }

    const allIndices = topIndices.concat(foilIndices);
    const sheetGeo = new THREE.BufferGeometry();
    sheetGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    sheetGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    sheetGeo.setIndex(allIndices);
    sheetGeo.addGroup(0, topIndices.length, 0);
    sheetGeo.addGroup(topIndices.length, foilIndices.length, 1);

    const sheetMesh = new THREE.Mesh(sheetGeo, [patternMat, goldFoilMat]);
    sheetMesh.castShadow = true;
    sheetMesh.receiveShadow = true;
    sheetMesh.frustumCulled = false;
    sheetMesh.userData.spring = springRef;
    systemGroup.add(sheetMesh);
    interactiveTargets.push(sheetMesh);

    const pCurr = new THREE.Vector3();
    const pNext = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const rawUp = new THREE.Vector3();
    const faceNorm = new THREE.Vector3();
    const widthDir = new THREE.Vector3();
    const rollUpAxis = new THREE.Vector3();
    const rollForwardAxis = new THREE.Vector3();
    const rollOutAxis = new THREE.Vector3();
    const rotMatrix = new THREE.Matrix4();

    function evalSpinePoint(u, theta, outVec) {
      const angle = theta - u * 1.48 * Math.PI;
      const radius = 3.22 + Math.sin(u * Math.PI) * 0.22;
      const waveY = Math.sin(theta * 2 - u * 3.1) * 0.28 * Math.sin(u * Math.PI * 0.85 + 0.15);
      outVec.set(
        Math.cos(angle) * radius,
        waveY,
        Math.sin(angle) * radius
      );
    }

    function updateWrapperLoop(theta, springOffset) {
      const posAttr = sheetGeo.attributes.position;
      const arr = posAttr.array;

      for (let i = 0; i <= SHEET_SEGS; i++) {
        const u = i / SHEET_SEGS;
        const uNext = Math.min(1, u + 0.005);

        evalSpinePoint(u, theta, pCurr);
        if (i < SHEET_SEGS) {
          evalSpinePoint(uNext, theta, pNext);
          tangent.subVectors(pNext, pCurr).normalize();
        } else {
          evalSpinePoint(u - 0.005, theta, pNext);
          tangent.subVectors(pCurr, pNext).normalize();
        }

        const angle = theta - u * 1.48 * Math.PI;
        const twist = Math.sin(u * Math.PI * 1.5 + theta) * 0.32 * Math.sin(u * Math.PI);
        rawUp.set(
          Math.cos(angle) * Math.sin(twist),
          Math.cos(twist),
          Math.sin(angle) * Math.sin(twist)
        ).normalize();

        faceNorm.crossVectors(tangent, rawUp).normalize();
        widthDir.crossVectors(faceNorm, tangent).normalize();

        const width = ROLL_LEN * 0.94 * (1 - 0.68 * Math.pow(u, 1.65));
        const halfW = width * 0.5;
        const halfT = 0.008;

        const cx = pCurr.x;
        const cy = pCurr.y + springOffset;
        const cz = pCurr.z;

        const wx = widthDir.x * halfW;
        const wy = widthDir.y * halfW;
        const wz = widthDir.z * halfW;

        const nx = faceNorm.x * halfT;
        const ny = faceNorm.y * halfT;
        const nz = faceNorm.z * halfT;

        const t0x = cx + wx + nx, t0y = cy + wy + ny, t0z = cz + wz + nz;
        const t1x = cx - wx + nx, t1y = cy - wy + ny, t1z = cz - wz + nz;
        const b0x = cx + wx - nx, b0y = cy + wy - ny, b0z = cz + wz - nz;
        const b1x = cx - wx - nx, b1y = cy - wy - ny, b1z = cz - wz - nz;

        const vIdx = i * vertsPerRing * 3;
        arr[vIdx + 0] = t0x; arr[vIdx + 1] = t0y; arr[vIdx + 2] = t0z;
        arr[vIdx + 3] = t1x; arr[vIdx + 4] = t1y; arr[vIdx + 5] = t1z;
        arr[vIdx + 6] = b0x; arr[vIdx + 7] = b0y; arr[vIdx + 8] = b0z;
        arr[vIdx + 9] = b1x; arr[vIdx + 10] = b1y; arr[vIdx + 11] = b1z;
        arr[vIdx + 12] = t0x; arr[vIdx + 13] = t0y; arr[vIdx + 14] = t0z;
        arr[vIdx + 15] = b0x; arr[vIdx + 16] = b0y; arr[vIdx + 17] = b0z;
        arr[vIdx + 18] = t1x; arr[vIdx + 19] = t1y; arr[vIdx + 20] = t1z;
        arr[vIdx + 21] = b1x; arr[vIdx + 22] = b1y; arr[vIdx + 23] = b1z;

        if (i === 0) {
          rollUpAxis.copy(widthDir);
          rollOutAxis.copy(faceNorm);
          rollForwardAxis.crossVectors(rollUpAxis, rollOutAxis).normalize();

          rollPivot.position.set(
            cx + faceNorm.x * (ROLL_OUTER_R - 0.008),
            cy + faceNorm.y * (ROLL_OUTER_R - 0.008),
            cz + faceNorm.z * (ROLL_OUTER_R - 0.008)
          );
          rotMatrix.makeBasis(rollForwardAxis, rollUpAxis, rollOutAxis);
          rollPivot.quaternion.setFromRotationMatrix(rotMatrix);
          rollSpinner.rotation.y = -theta * 3;
        }
      }

      posAttr.needsUpdate = true;
      sheetGeo.computeVertexNormals();
    }

    return { systemGroup, updateWrapperLoop };
  }

  // ============================================================================
  // 6. HIGH-CHROMA GLOSSY 3D KIDS LOGO ASSEMBLY
  // ============================================================================
  function buildHeroLogoAssembly(THREE) {
    const heroGroup = new THREE.Group();
    const quadrantGroups = [];
    const interactiveTargets = [];

    const tileBevel = {
      bevelEnabled: true,
      bevelThickness: 0.035,
      bevelSize: 0.03,
      bevelSegments: 5,
      curveSegments: 24
    };

    const letterBevel = {
      depth: 0.11,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.016,
      bevelSegments: 5,
      curveSegments: 32
    };

    const whiteLetterMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.13,
      metalness: 0.02,
      clearcoat: 0.92,
      clearcoatRoughness: 0.07,
      reflectivity: 0.95,
      envMapIntensity: 1.32
    });

    const panels = [
      {
        id: 'K',
        color: 0xb82994,
        emissive: 0x5c0e48,
        rimColor: 0x8f1870,
        points: [[193, 157], [505, 123], [516, 496], [240, 526]],
        depth: 0.46
      },
      {
        id: 'i',
        color: 0x0b3d91,
        emissive: 0x041d4d,
        rimColor: 0x072966,
        points: [[507, 177], [775, 170], [745, 504], [516, 496]],
        depth: 0.42
      },
      {
        id: 'D',
        color: 0x16b83e,
        emissive: 0x075c1c,
        rimColor: 0x0e8a2c,
        points: [[258, 524], [516, 496], [522, 875], [241, 829]],
        depth: 0.42
      },
      {
        id: 'S',
        color: 0xf7c600,
        emissive: 0x7a5900,
        rimColor: 0xd49b00,
        points: [[516, 496], [780, 505], [806, 855], [521, 850]],
        depth: 0.46
      }
    ];

    const quadrantMap = {};

    panels.forEach((p, idx) => {
      const qGroup = new THREE.Group();
      heroGroup.add(qGroup);

      const spring = { offset: 0, velocity: 0 };

      const shape = createPolygonPath(THREE, p.points, false, false);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: p.depth, ...tileBevel });
      const mat = new THREE.MeshPhysicalMaterial({
        color: p.color,
        emissive: p.emissive,
        emissiveIntensity: 0.24,
        roughness: 0.16,
        metalness: 0.04,
        clearcoat: 0.90,
        clearcoatRoughness: 0.08,
        reflectivity: 0.94,
        envMapIntensity: 1.12
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.spring = spring;
      qGroup.add(mesh);
      interactiveTargets.push(mesh);

      const rimGeo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.14,
        bevelEnabled: true,
        bevelThickness: 0.025,
        bevelSize: 0.048,
        bevelSegments: 4,
        curveSegments: 24
      });
      const rimMat = new THREE.MeshStandardMaterial({
        color: p.rimColor,
        emissive: p.emissive,
        emissiveIntensity: 0.32,
        roughness: 0.28,
        metalness: 0.08
      });
      const rimMesh = new THREE.Mesh(rimGeo, rimMat);
      rimMesh.position.z = -0.012;
      rimMesh.castShadow = true;
      rimMesh.receiveShadow = true;
      rimMesh.userData.spring = spring;
      qGroup.add(rimMesh);
      interactiveTargets.push(rimMesh);

      const qEntry = { id: p.id, group: qGroup, mat, index: idx, depth: p.depth, spring };
      quadrantGroups.push(qEntry);
      quadrantMap[p.id] = qEntry;
    });

    const mountLetter = (panelId, shapeOrShapes) => {
      const qEntry = quadrantMap[panelId];
      const geo = new THREE.ExtrudeGeometry(shapeOrShapes, letterBevel);
      const mesh = new THREE.Mesh(geo, whiteLetterMat);
      mesh.position.z = qEntry.depth + tileBevel.bevelThickness + letterBevel.bevelThickness - 0.002;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.spring = qEntry.spring;
      qEntry.group.add(mesh);
      interactiveTargets.push(mesh);
    };

    mountLetter(
      'K',
      svgPathToThreePath(
        THREE,
        'M 254,263 L 326,238 L 348,316 L 390,222 L 454,239 L 392,336 Q 436,368 476,400 L 443,458 Q 405,420 366,381 L 386,456 L 321,472 Z',
        false
      )
    );

    const iDot = new THREE.Shape();
    iDot.absarc(toX(641), toY(249), 43 * LOGO_SCALE, 0, TWO_PI, false);
    const iCheckHole = createPolygonPath(
      THREE,
      [[607, 229], [627, 231], [640, 252], [667, 238], [681, 245], [638, 281]],
      true,
      true
    );
    iDot.holes.push(iCheckHole);
    const iStem = createPolygonPath(
      THREE,
      [[592, 298], [672, 314], [635, 458], [570, 446]],
      false,
      false
    );
    mountLetter('i', [iDot, iStem]);

    const dOuter = svgPathToThreePath(
      THREE,
      'M 310,563 L 385,557 C 455,552 483,608 480,672 C 477,738 446,790 385,794 L 324,795 Z',
      false
    );
    const dInner = svgPathToThreePath(
      THREE,
      'M 366,617 L 373,735 L 392,734 C 420,732 428,704 426,673 C 424,642 414,615 386,616 Z',
      true
    );
    dOuter.holes.push(dInner);
    mountLetter('D', dOuter);

    mountLetter(
      'S',
      svgPathToThreePath(
        THREE,
        'M 738,578 L 716,623 C 692,604 672,598 654,598 C 635,598 625,606 626,618 C 627,631 644,638 678,650 C 722,665 746,690 744,726 C 742,774 698,804 644,804 C 600,804 568,788 544,764 L 574,716 C 598,738 622,750 646,750 C 668,750 680,741 680,728 C 680,715 664,707 628,694 C 584,678 565,654 566,618 C 567,572 606,546 660,546 C 694,546 718,556 738,578 Z',
        false
      )
    );

    const logoSpring = { offset: 0, velocity: 0 };
    const wrapOverlay = buildLogoGiftWrapOverlay(THREE, logoSpring, interactiveTargets);
    heroGroup.add(wrapOverlay.wrapRoot);

    const baseY = 0.12;
    heroGroup.position.y = baseY;

    return {
      heroGroup,
      baseY,
      quadrantGroups,
      logoSpring,
      wrapOverlay,
      interactiveTargets
    };
  }

  // ============================================================================
  // 7. SCENE INITIALIZATION & 10-SECOND HARMONIC ANIMATION LOOP
  // ============================================================================
  function initKidsGiftWrapperLoop(container, options = {}) {
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
    const initWidth = targetEl.clientWidth || window.innerWidth;
    const initHeight = targetEl.clientHeight || window.innerHeight;

    const camera = new THREE.PerspectiveCamera(40, initWidth / initHeight, 0.1, 100);
    camera.position.set(0, 0.45, 10.6);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: useTransparentBg,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(initWidth, initHeight);
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
    scene.environment = createStudioEnvironment(THREE, renderer);

    const ambientLight = new THREE.AmbientLight(0xfffaf5, 0.82);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xf4f8ff, 0xfff3e6, 0.90);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.32);
    keyLight.position.set(4.5, 7.5, 6.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 1.0;
    keyLight.shadow.camera.far = 25.0;
    const fSize = 5.5;
    keyLight.shadow.camera.left = -fSize;
    keyLight.shadow.camera.right = fSize;
    keyLight.shadow.camera.top = fSize;
    keyLight.shadow.camera.bottom = -fSize;
    keyLight.shadow.bias = -0.0003;
    keyLight.shadow.normalBias = 0.018;
    scene.add(keyLight);

    const specularLight = new THREE.DirectionalLight(0xfffdf8, 0.95);
    specularLight.position.set(6.2, 3.8, 8.5);
    scene.add(specularLight);

    const rimLight = new THREE.DirectionalLight(0xdbeafe, 0.72);
    rimLight.position.set(-5.0, 4.2, -5.5);
    scene.add(rimLight);

    const accentRose = new THREE.PointLight(0xd938b0, 1.35, 9.5, 1.5);
    accentRose.position.set(-2.35, 2.15, 2.35);
    scene.add(accentRose);

    const accentIceBlue = new THREE.PointLight(0x1d63dc, 1.35, 9.5, 1.5);
    accentIceBlue.position.set(2.35, 2.15, 2.35);
    scene.add(accentIceBlue);

    const accentMint = new THREE.PointLight(0x1ec94c, 1.25, 9.5, 1.5);
    accentMint.position.set(-2.35, -1.95, 2.35);
    scene.add(accentMint);

    const accentChampagne = new THREE.PointLight(0xfacc15, 1.35, 9.5, 1.5);
    accentChampagne.position.set(2.35, -1.95, 2.35);
    scene.add(accentChampagne);

    if (!useTransparentBg) {
      const floorGeo = new THREE.PlaneGeometry(40, 40);
      const floorMat = new THREE.ShadowMaterial({ opacity: 0.09 });
      const floorPlane = new THREE.Mesh(floorGeo, floorMat);
      floorPlane.rotation.x = -Math.PI / 2;
      floorPlane.position.y = -2.65;
      floorPlane.receiveShadow = true;
      scene.add(floorPlane);
    }

    // 5. Hero 3D KIDS Logo + Cross-Wrap Ribbons & Bow
    const {
      heroGroup,
      baseY,
      quadrantGroups,
      logoSpring,
      wrapOverlay,
      interactiveTargets
    } = buildHeroLogoAssembly(THREE);
    scene.add(heroGroup);

    // 6. Orbiting 3D Gift-Wrapper Roll & Unfurling Sheet
    const wrapperSpring = { offset: 0, velocity: 0 };
    const {
      systemGroup: wrapperSystemGroup,
      updateWrapperLoop
    } = buildOrbitingGiftWrapperSystem(THREE, wrapperSpring, interactiveTargets);
    scene.add(wrapperSystemGroup);

    // 7. Deterministic Upward-Drifting Metallic Gold & Crimson Ribbon Curls
    const CURL_COUNT = 130;
    const CURL_Y_MIN = -2.55;
    const CURL_Y_MAX = 4.65;
    const CURL_SPAN = CURL_Y_MAX - CURL_Y_MIN;

    const curlGeo = createRibbonCurlGeometry(THREE);
    const curlMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.24,
      metalness: 0.55
    });
    const curlInstanced = new THREE.InstancedMesh(curlGeo, curlMat, CURL_COUNT);
    scene.add(curlInstanced);

    const curlPalette = [
      new THREE.Color(0xf1c90e),
      new THREE.Color(0xd92638),
      new THREE.Color(0xfde047)
    ];
    const curlData = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < CURL_COUNT; i++) {
      curlData.push({
        seedX: (Math.random() - 0.5) * 11.5,
        seedY: Math.random() * CURL_SPAN,
        seedZ: (Math.random() - 0.5) * 9.0,
        riseCycles: 1 + Math.floor(Math.random() * 2),
        swayFreq: 1 + Math.floor(Math.random() * 2),
        swayAmp: 0.14 + Math.random() * 0.22,
        swayPhase: Math.random() * TWO_PI,
        scale: 0.65 + Math.random() * 0.70,
        rotFreq: (Math.random() < 0.5 ? 1 : -1) * (1 + Math.floor(Math.random() * 2))
      });
      curlInstanced.setColorAt(i, curlPalette[i % curlPalette.length]);
    }
    if (curlInstanced.instanceColor) curlInstanced.instanceColor.needsUpdate = true;

    // 8. Interactive Click / Tap Raycaster Spring Bounce & Ribbon Curl Bursts
    const goldBurstMat = new THREE.MeshStandardMaterial({
      color: 0xf1c90e,
      roughness: 0.22,
      metalness: 0.72
    });
    const redBurstMat = new THREE.MeshStandardMaterial({
      color: 0xd92638,
      roughness: 0.28,
      metalness: 0.18
    });

    const activeBursts = [];

    function spawnRibbonBurst(worldPoint) {
      const count = 14;
      const particles = [];

      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(
          curlGeo,
          i % 2 === 0 ? goldBurstMat : redBurstMat
        );
        mesh.position.copy(worldPoint);
        mesh.scale.setScalar(1.35);
        scene.add(mesh);

        const speed = 1.45 + Math.random() * 2.1;
        const azimuth = (i / count) * TWO_PI + (Math.random() - 0.5) * 0.35;
        const elevation = 0.35 + Math.random() * 0.85;

        particles.push({
          mesh,
          vel: new THREE.Vector3(
            Math.cos(azimuth) * Math.cos(elevation) * speed,
            Math.sin(elevation) * speed + 0.65,
            Math.sin(azimuth) * Math.cos(elevation) * speed
          ),
          spin: new THREE.Vector3(
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10
          )
        });
      }

      activeBursts.push({ particles, age: 0, maxAge: 0.82 });
    }

    const raycaster = new THREE.Raycaster();
    const downPos = new THREE.Vector2();
    const ndc = new THREE.Vector2();

    renderer.domElement.addEventListener('pointerdown', (e) => {
      downPos.set(e.clientX, e.clientY);
    });

    renderer.domElement.addEventListener('pointerup', (e) => {
      if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(interactiveTargets, false);
      if (hits.length > 0) {
        const hit = hits[0];
        if (hit.object.userData.spring) {
          hit.object.userData.spring.velocity = 4.0;
        }
        spawnRibbonBurst(hit.point);
      }
    });

    // 9. Responsive Container & Window Resize Handling
    function handleResize() {
      const w = targetEl.clientWidth || window.innerWidth;
      const h = targetEl.clientHeight || window.innerHeight;
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    }

    window.addEventListener('resize', handleResize);
    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(targetEl);
    }

    // 10. 10-Second Seamless Harmonic Animation Loop
    let isPlaying = options.autoPlay !== false;
    let loopCamActive = options.loopCam !== false;
    let playbackSpeed = options.speed || 1.0;
    let loopElapsed = 0;
    let animFrameId = null;

    if (typeof controls.addEventListener === 'function') {
      controls.addEventListener('start', () => {
        loopCamActive = false;
      });
    }

    const clock = new THREE.Clock();
    const targetCamPos = new THREE.Vector3();
    const targetLookAt = new THREE.Vector3(0, -0.05, 0);

    function updateSpring(spring, dt) {
      if (Math.abs(spring.offset) > 0.0001 || Math.abs(spring.velocity) > 0.0001) {
        const accel = -115 * spring.offset - 11.5 * spring.velocity;
        spring.velocity += accel * dt;
        spring.offset += spring.velocity * dt;
      } else {
        spring.offset = 0;
        spring.velocity = 0;
      }
    }

    function animate() {
      animFrameId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);

      if (isPlaying) {
        loopElapsed = (loopElapsed + dt * playbackSpeed) % LOOP_DURATION;
      }

      const progress = loopElapsed / LOOP_DURATION;
      const theta = progress * TWO_PI;

      // A. Hero KIDS Logo Harmonic Breathing & Tilt
      updateSpring(logoSpring, dt);
      heroGroup.position.y = baseY + Math.sin(theta) * 0.08 + logoSpring.offset * 0.45;
      heroGroup.rotation.y = Math.sin(theta) * 0.14;
      heroGroup.rotation.z = Math.cos(theta) * 0.03;

      for (let i = 0; i < quadrantGroups.length; i++) {
        const q = quadrantGroups[i];
        updateSpring(q.spring, dt);
        const phaseWave = Math.sin(theta + q.index * Math.PI * 0.5);
        q.group.position.z = phaseWave * 0.025 + q.spring.offset;
        q.mat.emissiveIntensity = 0.24 + phaseWave * 0.06;
      }

      // B. Cross-Wrap Satin Ribbons & Blooming 3D Gift Bow Loop
      const wrapWave = 0.5 - 0.5 * Math.cos(theta);
      const activeSegs = Math.max(8, Math.round(wrapOverlay.RIBBON_SEGS * (0.28 + 0.72 * wrapWave)));
      wrapOverlay.ribbonGeometries.forEach((rGeo) => {
        rGeo.setDrawRange(0, activeSegs * 24);
      });

      const bowScale = 0.78 + 0.28 * wrapWave;
      wrapOverlay.bowGroup.scale.setScalar(bowScale);
      wrapOverlay.bowGroup.rotation.y = Math.sin(theta) * 0.16;

      wrapOverlay.tailPivots.forEach(({ pivot, side }) => {
        pivot.rotation.z = side * (0.06 + Math.sin(theta * 2) * 0.09);
        pivot.rotation.x = Math.cos(theta * 2) * 0.08;
      });

      // C. Orbiting 3D Gift-Wrapper Roll & Unfurling Wrapper Sheet
      updateSpring(wrapperSpring, dt);
      updateWrapperLoop(theta, wrapperSpring.offset);

      // D. Deterministic Upward-Drifting Metallic Ribbon Curls
      for (let i = 0; i < CURL_COUNT; i++) {
        const c = curlData[i];
        const riseOffset = progress * c.riseCycles * CURL_SPAN;
        const yWrapped = (((c.seedY + riseOffset) % CURL_SPAN) + CURL_SPAN) % CURL_SPAN;

        dummy.position.set(
          c.seedX + Math.sin(theta * c.swayFreq + c.swayPhase) * c.swayAmp,
          CURL_Y_MIN + yWrapped,
          c.seedZ + Math.cos(theta * c.swayFreq + c.swayPhase) * c.swayAmp
        );
        dummy.rotation.set(
          theta * c.rotFreq + c.swayPhase,
          theta * c.rotFreq,
          c.swayPhase
        );
        dummy.scale.setScalar(c.scale);
        dummy.updateMatrix();
        curlInstanced.setMatrixAt(i, dummy.matrix);
      }
      curlInstanced.instanceMatrix.needsUpdate = true;

      // E. Interactive Ribbon Curl Bursts
      for (let bIdx = activeBursts.length - 1; bIdx >= 0; bIdx--) {
        const burst = activeBursts[bIdx];
        burst.age += dt;
        if (burst.age >= burst.maxAge) {
          burst.particles.forEach((p) => scene.remove(p.mesh));
          activeBursts.splice(bIdx, 1);
          continue;
        }
        const lifeRatio = 1 - burst.age / burst.maxAge;
        for (let pIdx = 0; pIdx < burst.particles.length; pIdx++) {
          const p = burst.particles[pIdx];
          p.vel.y -= 4.2 * dt;
          p.mesh.position.addScaledVector(p.vel, dt);
          p.mesh.rotation.x += p.spin.x * dt;
          p.mesh.rotation.y += p.spin.y * dt;
          p.mesh.rotation.z += p.spin.z * dt;
          p.mesh.scale.setScalar(Math.max(0.001, 1.35 * lifeRatio));
        }
      }

      // F. Loop Cam Harmonic Drift vs Free Orbit
      if (loopCamActive) {
        const w = targetEl.clientWidth || window.innerWidth;
        const baseZ = w < 420 ? 12.6 : 10.6;
        targetCamPos.set(
          Math.sin(theta) * 0.95,
          0.45 + Math.sin(theta * 2) * 0.25,
          baseZ + Math.cos(theta) * 0.45
        );
        camera.position.lerp(targetCamPos, 0.06);
        controls.target.lerp(targetLookAt, 0.08);
      }

      controls.update();
      renderer.render(scene, camera);
    }

    animate();

    return {
      scene,
      camera,
      renderer,
      setPlaying(val) {
        isPlaying = Boolean(val);
      },
      setLoopCam(val) {
        loopCamActive = Boolean(val);
      },
      setSpeed(val) {
        playbackSpeed = Number(val) || 1.0;
      },
      destroy() {
        if (animFrameId !== null) cancelAnimationFrame(animFrameId);
        window.removeEventListener('resize', handleResize);
        if (resizeObserver) resizeObserver.disconnect();
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentNode === targetEl) {
          targetEl.removeChild(renderer.domElement);
        }
      }
    };
  }

  // ============================================================================
  // 8. AUTOMATIC CDN DROP-IN BOOTSTRAP
  // ============================================================================
  function ensureThreeAndBoot() {
    if (typeof document === 'undefined') return;

    const runInit = () => {
      if (currentScript && currentScript.getAttribute('data-manual') === 'true') {
        return;
      }

      const customSelector = currentScript && currentScript.getAttribute('data-target');
      const target =
        (customSelector && document.querySelector(customSelector)) ||
        document.getElementById('top-right-gift-loop');

      if (target) {
        initKidsGiftWrapperLoop(target);
      }
    };

    const start = () => {
      if (global.THREE) {
        runInit();
        return;
      }
      const script = document.createElement('script');
      script.src = THREE_R128_CDN;
      script.onload = runInit;
      document.head.appendChild(script);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  }

  global.KidsGiftWrapperLoop = {
    init: initKidsGiftWrapperLoop
  };

  ensureThreeAndBoot();
})(typeof window !== 'undefined' ? window : this);
