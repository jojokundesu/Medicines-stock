// The 3D shop environment, first-person camera and light interactions.
import * as THREE from 'three';
import { productLabel, noteTexture, canvasTexture } from './textures';
import type { DenomCounts } from '../engine/money';
import { DEFAULT_DENOMS } from '../engine/money';

export type SceneProduct = {
  id: number;
  name: string;
  mrp: number;
  pack: number;
  partialAllowed: boolean;
  qty: number;   // whole packs
  units: number; // loose units
};

export type ShopCallbacks = {
  onProductClick?: (index: number) => void;
  onDrawerClick?: () => void;
  onCalculatorClick?: () => void;
};

const CUSTOMER_COLORS: Record<string, string> = {
  patient: '#3b82f6', impatient: '#ef4444', confused: '#8b5cf6',
  talkative: '#10b981', big: '#f59e0b', exact: '#06b6d4',
  'large-note': '#1f2937', bargainer: '#ec4899', fast: '#f97316',
  elderly: '#94a3b8', distracting: '#84cc16'
};

export class ShopScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private raf = 0;
  private container: HTMLElement;
  private cb: ShopCallbacks;
  private disposed = false;

  // look controls
  private yaw = 0;
  private pitch = -0.08;
  private targetYaw = 0;
  private targetPitch = -0.08;
  private dragging = false;
  private downX = 0;
  private downY = 0;
  private moved = false;

  // world groups
  private productGroup = new THREE.Group();
  private paymentGroup = new THREE.Group();
  private customerGroup = new THREE.Group();
  private fan!: THREE.Group;
  private drawer!: THREE.Group;
  private drawerOpen = false;

  // customer animation
  private customerPresent = false;
  private customerPhase: 'enter' | 'idle' | 'leave' = 'enter';
  private customerPhaseT = 0;
  private patience = 1;
  private legL!: THREE.Object3D;
  private legR!: THREE.Object3D;
  private armL!: THREE.Object3D;
  private armR!: THREE.Object3D;

  private clickables: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  private patienceBarMat!: THREE.MeshBasicMaterial;

  constructor(container: HTMLElement, cb: ShopCallbacks = {}) {
    this.container = container;
    this.cb = cb;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'none';

    this.camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.1, 60);
    this.camera.position.set(0, 1.62, 1.35);
    this.camera.lookAt(0, 1.2, -1.5);

    this.scene.background = new THREE.Color('#cdd8e6');
    this.scene.fog = new THREE.Fog('#cdd8e6', 8, 24);

    this.buildEnvironment();
    this.buildCounter();
    this.buildShelves();
    this.buildFan();
    this.buildCustomer();
    this.scene.add(this.productGroup, this.paymentGroup);

    this.bindEvents();
    this.loop();
  }

  // ---------- environment ----------
  private buildEnvironment() {
    // lights
    const hemi = new THREE.HemisphereLight('#ffffff', '#8a7a5f', 0.7);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff4e0', 1.1);
    sun.position.set(4, 6, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -8;
    sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -8;
    this.scene.add(sun);
    const counterLight = new THREE.PointLight('#ffd9a0', 22, 8, 2);
    counterLight.position.set(0, 2.6, -0.4);
    this.scene.add(counterLight);

    // floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.MeshStandardMaterial({ color: '#b28a5f', roughness: 0.9 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // back wall
    const wallMat = new THREE.MeshStandardMaterial({ color: '#e8f0ea', roughness: 0.95 });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 4.6), wallMat);
    wall.position.set(0, 2.3, 2.6);
    this.scene.add(wall);

    // right wall (window side)
    const rwall = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.6), new THREE.MeshStandardMaterial({ color: '#d7e6f0', roughness: 0.95 }));
    rwall.position.set(3.2, 2.3, -1.4);
    rwall.rotation.y = Math.PI / 2;
    this.scene.add(rwall);

    // left wall
    const lwall = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.6), wallMat);
    lwall.position.set(-3.2, 2.3, -1.4);
    lwall.rotation.y = -Math.PI / 2;
    this.scene.add(lwall);

    // window
    const win = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 1.4),
      new THREE.MeshBasicMaterial({ color: '#bfe3ff' })
    );
    win.position.set(3.19, 2.5, -1.4);
    win.rotation.y = Math.PI / 2;
    this.scene.add(win);

    // shop sign on back wall
    const signTex = canvasTexture(512, 160, (ctx) => {
      ctx.fillStyle = '#0f766e';
      ctx.fillRect(0, 0, 512, 160);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 64px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DUKAAN  MEDICOS', 256, 100);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.0), new THREE.MeshBasicMaterial({ map: signTex }));
    sign.position.set(0, 3.4, 2.55);
    this.scene.add(sign);
  }

  private buildCounter() {
    const group = new THREE.Group();
    // counter body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(5.0, 0.98, 1.25),
      new THREE.MeshStandardMaterial({ color: '#7a4a28', roughness: 0.6 })
    );
    body.position.set(0, 0.49, 0);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // counter top
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 0.08, 1.45),
      new THREE.MeshStandardMaterial({ color: '#5d3a1f', roughness: 0.4 })
    );
    top.position.set(0, 1.0, 0);
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);

    // cash drawer
    this.drawer = new THREE.Group();
    const drawerBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.16, 0.6),
      new THREE.MeshStandardMaterial({ color: '#3b3f46', roughness: 0.5, metalness: 0.4 })
    );
    drawerBody.position.set(-1.3, 0.86, 0);
    this.drawer.add(drawerBody);
    // coin/note trays inside (visible when open)
    const trayMat = new THREE.MeshStandardMaterial({ color: '#6b7280', roughness: 0.7 });
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.5), trayMat);
      t.position.set(-0.35 + i * 0.22, 0.78, 0);
      this.drawer.add(t);
    }
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.03, 0.05),
      new THREE.MeshStandardMaterial({ color: '#d1d5db', metalness: 0.7, roughness: 0.3 })
    );
    handle.position.set(-1.3, 0.86, 0.31);
    handle.userData.type = 'drawer';
    this.drawer.add(handle);
    group.add(this.drawer);
    this.clickables.push(handle);

    // register
    const reg = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.5), new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.4 }));
    reg.position.set(1.5, 1.16, -0.15);
    reg.castShadow = true;
    group.add(reg);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.18), new THREE.MeshBasicMaterial({ color: '#a7f3d0' }));
    screen.position.set(1.5, 1.34, -0.1);
    screen.rotation.x = -0.4;
    group.add(screen);

    // receipt printer
    const printer = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.4), new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.5 }));
    printer.position.set(2.15, 1.12, 0.1);
    printer.castShadow = true;
    group.add(printer);
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.3), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
    paper.position.set(2.15, 1.22, 0.1);
    group.add(paper);

    // calculator (physical proxy — clicking opens the UI)
    const calc = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.24), new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.3 }));
    calc.position.set(-2.1, 1.05, 0.2);
    calc.rotation.y = 0.2;
    calc.userData.type = 'calculator';
    group.add(calc);
    this.clickables.push(calc);
    const calcScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.03), new THREE.MeshBasicMaterial({ color: '#c9f2dd' }));
    calcScreen.position.set(-2.1, 1.06, 0.21);
    calcScreen.rotation.y = 0.2;
    calcScreen.rotation.x = -0.2;
    group.add(calcScreen);

    // patience bar (above counter, facing player)
    const barBg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.06), new THREE.MeshBasicMaterial({ color: '#1f2937' }));
    barBg.position.set(0, 1.7, 0.05);
    group.add(barBg);
    this.patienceBarMat = new THREE.MeshBasicMaterial({ color: '#22c55e' });
    const barFill = new THREE.Mesh(new THREE.PlaneGeometry(1.58, 0.04), this.patienceBarMat);
    barFill.position.set(0, 1.7, 0.06);
    barFill.name = 'patienceFill';
    group.add(barFill);

    this.scene.add(group);
  }

  private buildShelves() {
    const group = new THREE.Group();
    const shelfMat = new THREE.MeshStandardMaterial({ color: '#8a5a33', roughness: 0.7 });
    const colors = ['#e11d48', '#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
    for (let row = 0; row < 3; row++) {
      const y = 1.35 + row * 0.55;
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.06, 0.5), shelfMat);
      shelf.position.set(0, y - 0.03, 2.3);
      group.add(shelf);
      // medicine boxes on shelf
      for (let i = 0; i < 9; i++) {
        const h = 0.28 + ((i * 13 + row * 7) % 3) * 0.08;
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, h, 0.2),
          new THREE.MeshStandardMaterial({ color: colors[(i + row * 3) % colors.length], roughness: 0.7 })
        );
        box.position.set(-2.6 + i * 0.62, y + h / 2, 2.3);
        box.castShadow = true;
        group.add(box);
      }
    }
    this.scene.add(group);
  }

  private buildFan() {
    this.fan = new THREE.Group();
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), new THREE.MeshStandardMaterial({ color: '#9ca3af' }));
    this.fan.add(hub);
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.7, 0.16),
        new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.5 })
      );
      blade.position.set(0, 0.3, 0);
      blade.rotation.y = (i * Math.PI * 2) / 3;
      const holder = new THREE.Group();
      holder.add(blade);
      this.fan.add(holder);
    }
    this.fan.position.set(0, 3.1, 0.4);
    this.scene.add(this.fan);
  }

  private buildCustomer() {
    const g = this.customerGroup;
    const skin = new THREE.MeshStandardMaterial({ color: '#e0a06a', roughness: 0.8 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 4, 12), new THREE.MeshStandardMaterial({ color: '#3b82f6', roughness: 0.8 }));
    torso.position.y = 1.12;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 16), skin);
    head.position.y = 1.62;
    g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.175, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#1f2937' }));
    hair.position.y = 1.66;
    g.add(hair);

    this.armL = new THREE.Group();
    this.armL.position.set(-0.3, 1.34, 0);
    const al = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.5, 4, 8), skin);
    al.position.y = -0.26;
    this.armL.add(al);
    g.add(this.armL);
    this.armR = new THREE.Group();
    this.armR.position.set(0.3, 1.34, 0);
    const ar = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.5, 4, 8), skin);
    ar.position.y = -0.26;
    this.armR.add(ar);
    g.add(this.armR);

    this.legL = new THREE.Group();
    this.legL.position.set(-0.12, 0.82, 0);
    const ll = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.6, 4, 8), new THREE.MeshStandardMaterial({ color: '#374151' }));
    ll.position.y = -0.35;
    this.legL.add(ll);
    g.add(this.legL);
    this.legR = new THREE.Group();
    this.legR.position.set(0.12, 0.82, 0);
    const lr = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.6, 4, 8), new THREE.MeshStandardMaterial({ color: '#374151' }));
    lr.position.y = -0.35;
    this.legR.add(lr);
    g.add(this.legR);

    // shopping bag
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.1), new THREE.MeshStandardMaterial({ color: '#fde68a', roughness: 0.9 }));
    bag.position.set(0.34, 0.72, 0.02);
    g.add(bag);

    g.visible = false;
    this.scene.add(g);
  }

  // ---------- public API ----------
  setProducts(products: SceneProduct[]) {
    // clear
    while (this.productGroup.children.length) disposeObject(this.productGroup.children.pop()!);
    this.clickables = this.clickables.filter(c => c.userData.type !== 'product');
    const n = products.length;
    const spread = Math.min(0.85, (4.2 / Math.max(n, 1)));
    products.forEach((p, i) => {
      const x = -((n - 1) / 2) * spread + i * spread;
      const tex = productLabel(p.name, p.mrp, p.pack, p.partialAllowed, null);
      const stack = Math.max(1, p.qty);
      for (let s = 0; s < stack; s++) {
        const w = 0.42, h = 0.26, d = 0.18;
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })
        );
        box.position.set(x, 1.06 + h / 2 + s * h, 0.05);
        box.castShadow = true;
        box.userData.type = 'product';
        box.userData.index = i;
        this.productGroup.add(box);
        this.clickables.push(box);
      }
      if (p.units > 0) {
        const chip = canvasTexture(256, 128, (ctx) => {
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(0, 0, 256, 128);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 56px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${p.units} loose`, 128, 82);
        });
        const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), new THREE.MeshBasicMaterial({ map: chip }));
        tag.position.set(x, 1.42 + stack * 0.26, 0.06);
        this.productGroup.add(tag);
      }
    });
  }

  clearProducts() {
    while (this.productGroup.children.length) disposeObject(this.productGroup.children.pop()!);
    this.clickables = this.clickables.filter(c => c.userData.type !== 'product');
  }

  setPayment(given: DenomCounts) {
    this.clearPayment();
    let x = -1.4;
    const denoms = DEFAULT_DENOMS;
    for (const d of denoms) {
      const count = given[d.id] || 0;
      for (let i = 0; i < count; i++) {
        if (d.kind === 'note') {
          const tex = noteTexture(d.id, d.label.replace('₹', ''));
          const note = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.24), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
          note.rotation.x = -Math.PI / 2;
          note.rotation.z = (Math.random() - 0.5) * 0.4;
          note.position.set(x, 1.045, -0.35);
          note.castShadow = true;
          this.paymentGroup.add(note);
          x += 0.34;
        } else {
          const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.025, 16), new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 0.6, roughness: 0.3 }));
          coin.rotation.x = Math.PI / 2;
          coin.position.set(x, 1.045, -0.35);
          this.paymentGroup.add(coin);
          x += 0.2;
        }
        if (x > 1.6) { x = -1.4; }
      }
    }
  }

  clearPayment() {
    while (this.paymentGroup.children.length) disposeObject(this.paymentGroup.children.pop()!);
  }

  setCustomer(kind: string, present: boolean) {
    if (present && !this.customerPresent) {
      this.customerPresent = true;
      this.customerPhase = 'enter';
      this.customerPhaseT = 0;
      this.customerGroup.visible = true;
      const torso = this.customerGroup.children.find(c => (c as THREE.Mesh).geometry?.type === 'CapsuleGeometry') as THREE.Mesh;
      if (torso) (torso.material as THREE.MeshStandardMaterial).color.set(CUSTOMER_COLORS[kind] || '#3b82f6');
    } else if (!present && this.customerPresent) {
      this.customerPhase = 'leave';
      this.customerPhaseT = 0;
    }
  }

  setPatience(ratio: number) {
    this.patience = THREE.MathUtils.clamp(ratio, 0, 1);
    this.patienceBarMat.color.setHSL(0.33 * this.patience, 0.8, 0.5);
    const fill = this.scene.getObjectByName('patienceFill');
    if (fill) fill.scale.x = Math.max(0.001, this.patience);
  }

  setDrawerOpen(open: boolean) {
    this.drawerOpen = open;
  }

  nudgeLook() {
    // small shake to feel alive on errors
    this.targetPitch += 0.02;
  }

  // ---------- input ----------
  private onPointerDown = (e: PointerEvent) => {
    this.dragging = true;
    this.moved = false;
    this.downX = e.clientX;
    this.downY = e.clientY;
  };
  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.downX;
    const dy = e.clientY - this.downY;
    if (Math.abs(dx) + Math.abs(dy) > 6) this.moved = true;
    this.targetYaw -= dx * 0.004;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch - dy * 0.003, -0.6, 0.6);
    this.downX = e.clientX;
    this.downY = e.clientY;
  };
  private onPointerUp = (e: PointerEvent) => {
    if (this.dragging && !this.moved) this.pick(e.clientX, e.clientY);
    this.dragging = false;
  };
  private onResize = () => this.resize();

  private bindEvents() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('resize', this.onResize);
  }

  private pick(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.clickables, false);
    if (!hits.length) return;
    const obj = hits[0].object;
    const type = obj.userData.type;
    if (type === 'product') this.cb.onProductClick?.(obj.userData.index);
    else if (type === 'drawer') this.cb.onDrawerClick?.();
    else if (type === 'calculator') this.cb.onCalculatorClick?.();
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    // Widen the field of view in portrait so the counter stays in view.
    this.camera.fov = w / h < 0.8 ? 80 : 70;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // ---------- loop ----------
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;

    // fan
    this.fan.rotation.y += dt * 6;

    // look smoothing
    this.yaw += (this.targetYaw - this.yaw) * Math.min(1, dt * 8);
    this.pitch += (this.targetPitch - this.pitch) * Math.min(1, dt * 8);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    // drawer slide
    const dz = this.drawer.position.z;
    const targetZ = this.drawerOpen ? 0.5 : 0;
    this.drawer.position.z += (targetZ - dz) * Math.min(1, dt * 10);

    // customer animation
    this.animateCustomer(dt, t);

    this.renderer.render(this.scene, this.camera);
  };

  private animateCustomer(dt: number, t: number) {
    const g = this.customerGroup;
    if (!this.customerPresent) return;
    const enterZ = -7, standZ = -2.1;

    if (this.customerPhase === 'enter') {
      this.customerPhaseT += dt;
      const k = Math.min(1, this.customerPhaseT / 1.6);
      const z = THREE.MathUtils.lerp(enterZ, standZ, easeOut(k));
      g.position.z = z;
      g.position.y = Math.abs(Math.sin(k * Math.PI * 6)) * 0.04;
      this.swingArms(k * 6, 0.5);
      if (k >= 1) { this.customerPhase = 'idle'; this.customerPhaseT = 0; }
      return;
    }
    if (this.customerPhase === 'leave') {
      this.customerPhaseT += dt;
      const k = Math.min(1, this.customerPhaseT / 1.4);
      g.position.z = THREE.MathUtils.lerp(standZ, enterZ, easeOut(k));
      g.position.y = Math.abs(Math.sin(k * Math.PI * 6)) * 0.04;
      this.swingArms(k * 6, 0.5);
      if (k >= 1) { this.customerPresent = false; g.visible = false; this.customerPhase = 'enter'; this.customerPhaseT = 0; }
      return;
    }
    // idle
    g.position.z = standZ;
    g.position.y = Math.sin(t * 1.4) * 0.012;
    const imp = this.patience < 0.35;
    if (imp) {
      // impatient foot tap
      const tap = Math.abs(Math.sin(t * 12)) * 0.35;
      this.legR.rotation.x = tap;
      this.armR.rotation.z = -0.3 + Math.sin(t * 12) * 0.1;
    } else {
      this.legR.rotation.x = Math.sin(t * 1.4) * 0.04;
      this.armR.rotation.z = Math.sin(t * 1.2) * 0.05;
    }
  }

  private swingArms(phase: number, amp: number) {
    this.armL.rotation.x = Math.sin(phase) * amp;
    this.armR.rotation.x = Math.sin(phase + Math.PI) * amp;
    this.legL.rotation.x = Math.sin(phase + Math.PI) * amp * 0.7;
    this.legR.rotation.x = Math.sin(phase) * amp * 0.7;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function easeOut(k: number): number {
  return 1 - Math.pow(1 - k, 3);
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => disposeMaterial(m));
    else if (mat) disposeMaterial(mat);
  });
}

function disposeMaterial(m: THREE.Material) {
  const std = m as THREE.MeshStandardMaterial;
  if (std.map) std.map.dispose();
  m.dispose();
}
