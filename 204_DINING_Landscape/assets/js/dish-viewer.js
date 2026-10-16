/* Shared GLB viewer. One instance owns its canvas, controls and GPU resources. */
window.DishViewer = class DishViewer {
  constructor(host, status) { this.host = host; this.status = status; this.generation = 0; }
  disposeObject(root) {
    const textures = new Set();
    root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (!m) continue;
        Object.values(m).forEach(v => { if (v && v.isTexture) textures.add(v); });
        m.dispose();
      }
    });
    textures.forEach(t => t.dispose());
  }
  clear() {
    this.generation++;
    clearTimeout(this.timeout);
    cancelAnimationFrame(this.frame);
    if (this.observer) this.observer.disconnect();
    if (this.controls) this.controls.dispose();
    if (this.scene) this.disposeObject(this.scene);
    if (this.renderer) { this.renderer.dispose(); this.renderer.forceContextLoss(); }
    this.host.replaceChildren();
    this.renderer = this.scene = this.controls = null;
    this.host.hidden = true;
  }
  show(url, onReady = () => {}, onError = () => {}) {
    this.clear();
    if (!url) return;
    const generation = this.generation;
    this.host.hidden = false;
    this.status.textContent = '3D 불러오는 중…';
    const fail = error => {
      if (generation !== this.generation) return;
      console.warn('Dish model unavailable:', error);
      this.clear();
      this.status.textContent = '3D를 불러오지 못해 사진을 표시합니다.';
      onError();
    };
    try {
      const T = window.THREE;
      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(35, 1, 0.01, 100);
      this.camera.position.set(0, 1.4, 3.5);
      this.renderer = new T.WebGLRenderer({alpha: true, antialias: true});
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      this.renderer.outputEncoding = T.sRGBEncoding;
      this.renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.15;
      this.host.append(this.renderer.domElement);
      this.renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); fail('WebGL context lost'); });
      this.scene.add(new T.HemisphereLight(0xffffff, 0x8b7660, 1.5));
      const light = new T.DirectionalLight(0xffffff, 2);
      light.position.set(3, 5, 4); this.scene.add(light);
      this.controls = new T.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.enablePan = false;
      this.controls.minDistance = 1.2; this.controls.maxDistance = 7;
      this.controls.autoRotate = true; this.controls.autoRotateSpeed = 0.55;
      this.controls.maxPolarAngle = Math.PI * 0.92;
      const resize = () => {
        if (!this.renderer) return;
        const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
        this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      };
      this.observer = new ResizeObserver(resize); this.observer.observe(this.host); resize();
      this.timeout = setTimeout(() => fail('Loading timeout'), 45000);
      new T.GLTFLoader().load(url, gltf => {
        if (generation !== this.generation) { this.disposeObject(gltf.scene); return; }
        clearTimeout(this.timeout);
        const root = gltf.scene;
        const bounds = new T.Box3().setFromObject(root);
        const size = bounds.getSize(new T.Vector3());
        const maxSize = Math.max(size.x, size.y, size.z);
        if (!Number.isFinite(maxSize) || maxSize <= 0) { this.disposeObject(root); fail('Empty model'); return; }
        const center = bounds.getCenter(new T.Vector3());
        const group = new T.Group(); group.add(root); root.position.sub(center);
        group.scale.setScalar(2 / maxSize); this.scene.add(group);
        this.status.textContent = '자동 회전 · 드래그로 각도 조절 · 두 손가락으로 확대';
        onReady();
        const animate = () => {
          if (generation !== this.generation) return;
          this.frame = requestAnimationFrame(animate);
          if (!document.hidden) { this.controls.update(); this.renderer.render(this.scene, this.camera); }
        };
        animate();
      }, undefined, fail);
    } catch (error) { fail(error); }
  }
  preset(name) {
    if (!this.controls) return;
    const positions = {hero:[0,1.4,3.5], 'tilt-left':[-2.6,1.4,2.6], 'tilt-right':[2.6,1.4,2.6], zoom:[0,0.7,1.8]};
    this.camera.position.set(...(positions[name] || positions.hero));
    this.controls.target.set(0,0,0); this.controls.update();
  }
};
