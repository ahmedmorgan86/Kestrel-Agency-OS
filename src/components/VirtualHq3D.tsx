import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Camera, ChevronDown, ChevronUp, Compass, Layers, RotateCcw } from 'lucide-react';
import type { AvatarConfig, OperationalStatus, ZoneRect } from '../domain/hq';

export interface Hq3DActor {
  id: string;
  actorType: 'human' | 'agent';
  name: string;
  jobTitle: string;
  departmentId: string | null;
  departmentName?: string | null;
  operationalStatus: OperationalStatus;
  avatarConfig: AvatarConfig;
  worldPosition: { x: number; y: number; z: number; rotY: number; zoneId: string; stationCode: string };
  currentTaskTitle?: string | null;
  activeMeetingId?: string | null;
  activeMeetingTitle?: string | null;
  openTasks?: number;
}

export interface Hq3DMeetingRoom {
  id: string;
  code: string;
  name: string;
  capacity: number;
  activeMeeting?: { id: string; title: string } | null;
}

export interface Hq3DSelection {
  kind: 'human' | 'agent' | 'department' | 'meeting_room' | 'reception' | 'screen';
  id: string;
  label: string;
  targetRoute?: string;
}

interface VirtualHq3DProps {
  companyName: string;
  primaryColor: string;
  theme: 'light' | 'dark';
  reducedMotion: boolean;
  zones: ZoneRect[];
  actors: Hq3DActor[];
  meetingRooms: Hq3DMeetingRoom[];
  pendingApprovalsCount: number;
  selectedId: string | null;
  onSelect: (selection: Hq3DSelection) => void;
  onWebglUnavailable?: () => void;
}

interface CameraPreset {
  id: string;
  label: string;
  pos: [number, number, number];
  target: [number, number, number];
}

const CAMERA_PRESETS: CameraPreset[] = [
  { id: 'overview', label: 'HQ Overview', pos: [0, 29, 36], target: [0, 0, 2] },
  { id: 'reception', label: 'Reception', pos: [0, 9.5, 31], target: [0, 1.2, 20.5] },
  { id: 'executive', label: 'Executive', pos: [0, 12, -2], target: [0, 1, -15] },
  { id: 'creative', label: 'Creative Wing', pos: [-16, 13, 15], target: [-6, 0.8, 3] },
  { id: 'meetings', label: 'Boardrooms', pos: [-22, 13, -3], target: [-15, 0.8, -15] },
];

const STATUS_COLORS: Record<OperationalStatus, number> = {
  idle: 0x64748b,
  queued: 0x3b82f6,
  working: 0x2563eb,
  validating: 0x0ea5e9,
  in_meeting: 0x6366f1,
  waiting_for_approval: 0xf59e0b,
  waiting_for_input: 0xf59e0b,
  failed: 0xef4444,
  paused: 0x94a3b8,
  disabled: 0x475569,
  completed: 0x10b981,
};

function makeSignTexture(
  title: string,
  subtitle: string,
  accentHex: string,
  darkSurface: boolean,
  anisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = darkSurface ? '#0f172a' : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = accentHex;
    ctx.fillRect(0, 0, canvas.width, 14);

    ctx.strokeStyle = darkSurface ? '#334155' : '#cbd5e1';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

    ctx.fillStyle = darkSurface ? '#f8fafc' : '#0f172a';
    ctx.font = '700 32px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(title.slice(0, 26), 24, 68);

    ctx.fillStyle = darkSurface ? '#94a3b8' : '#475569';
    ctx.font = '500 20px "IBM Plex Mono", monospace';
    ctx.fillText(subtitle.slice(0, 38), 24, 118);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function makeFloorGridTexture(dark: boolean, anisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = dark ? '#111827' : '#edf1f7';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = dark ? '#1e293b' : '#dde4ee';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 12);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

function buildWorkstationGroup(
  x: number,
  z: number,
  rotY: number,
  screenColor: number,
  dark: boolean,
  castShadow: boolean
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotY;

  const deskTopMat = new THREE.MeshStandardMaterial({
    color: dark ? 0x1e293b : 0xf8fafc,
    roughness: 0.45,
    metalness: 0.08,
  });
  const legMat = new THREE.MeshStandardMaterial({
    color: dark ? 0x334155 : 0x475569,
    roughness: 0.35,
    metalness: 0.65,
  });
  const monitorFrameMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.3,
    metalness: 0.5,
  });
  const screenMat = new THREE.MeshStandardMaterial({
    color: screenColor,
    emissive: screenColor,
    emissiveIntensity: screenColor === 0x334155 ? 0.12 : 0.45,
    roughness: 0.2,
  });

  // Tabletop
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.85), deskTopMat);
  top.position.set(0, 0.74, 0);
  top.castShadow = castShadow;
  top.receiveShadow = true;
  group.add(top);

  // 4 steel legs
  const legGeo = new THREE.BoxGeometry(0.06, 0.72, 0.06);
  for (const [lx, lz] of [
    [-0.76, -0.34],
    [0.76, -0.34],
    [-0.76, 0.34],
    [0.76, 0.34],
  ]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(lx, 0.36, lz);
    leg.castShadow = castShadow;
    group.add(leg);
  }

  // Monitor stand + widescreen display
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.08), monitorFrameMat);
  stand.position.set(0, 0.88, -0.2);
  group.add(stand);

  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.46, 0.05), monitorFrameMat);
  bezel.position.set(0, 1.08, -0.19);
  bezel.castShadow = castShadow;
  group.add(bezel);

  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.39, 0.02), screenMat);
  screen.position.set(0, 1.08, -0.155);
  group.add(screen);

  // Keyboard tray
  const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.025, 0.16), monitorFrameMat);
  keyboard.position.set(0, 0.795, 0.12);
  group.add(keyboard);

  // Ergonomic Chair behind desk
  const chairMat = new THREE.MeshStandardMaterial({
    color: dark ? 0x334155 : 0x64748b,
    roughness: 0.65,
    metalness: 0.1,
  });
  const chairBase = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.06, 12), legMat);
  chairBase.position.set(0, 0.03, 0.72);
  group.add(chairBase);

  const chairStem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.42, 8), legMat);
  chairStem.position.set(0, 0.25, 0.72);
  group.add(chairStem);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.07, 0.46), chairMat);
  seat.position.set(0, 0.47, 0.72);
  group.add(seat);

  const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.07), chairMat);
  backrest.position.set(0, 0.74, 0.93);
  group.add(backrest);

  return group;
}

function buildAvatarGroup(actor: Hq3DActor, castShadow: boolean): THREE.Group {
  const root = new THREE.Group();
  const isAi = actor.actorType === 'agent';
  const accentColor = new THREE.Color(actor.avatarConfig.accentColor || (isAi ? '#2563eb' : '#334155'));
  const bodyColor = new THREE.Color(actor.avatarConfig.bodyColor || (isAi ? '#1e293b' : '#334155'));
  const statusHex = STATUS_COLORS[actor.operationalStatus] ?? 0x64748b;

  // Ground contact/status ring slightly above carpet (y = 0.055 avoids Z-fighting)
  const ringMat = new THREE.MeshStandardMaterial({
    color: statusHex,
    emissive: statusHex,
    emissiveIntensity: actor.operationalStatus === 'idle' || actor.operationalStatus === 'paused' ? 0.05 : 0.45,
    roughness: 0.4,
  });
  const statusRing = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 24), ringMat);
  statusRing.rotation.x = -Math.PI / 2;
  statusRing.position.y = 0.055;
  root.add(statusRing);

  const torsoMat = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: isAi ? 0.35 : 0.65,
    metalness: isAi ? 0.45 : 0.08,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: isAi && actor.operationalStatus === 'working' ? accentColor : new THREE.Color(0x000000),
    emissiveIntensity: isAi && actor.operationalStatus === 'working' ? 0.35 : 0,
    roughness: 0.3,
    metalness: isAi ? 0.4 : 0.1,
  });

  // Legs / Lower Base
  const lower = isAi
    ? new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.56, 8), torsoMat)
    : new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.58, 12), torsoMat);
  lower.position.y = 0.34;
  lower.castShadow = castShadow;
  root.add(lower);

  // Torso
  const torsoGeo = isAi
    ? new THREE.CylinderGeometry(0.25, 0.18, 0.58, 6)
    : new THREE.BoxGeometry(0.46, 0.56, 0.26);
  const torso = new THREE.Mesh(torsoGeo, accentMat);
  torso.position.y = 0.88;
  torso.castShadow = castShadow;
  root.add(torso);

  // Articulated arms (used strictly for honest typing motion ONLY when operationalStatus === 'working')
  const armGeo = new THREE.BoxGeometry(0.11, 0.38, 0.11);
  const leftArm = new THREE.Mesh(armGeo, torsoMat);
  leftArm.position.set(-0.3, 0.86, 0.08);
  leftArm.name = 'leftArm';
  root.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, torsoMat);
  rightArm.position.set(0.3, 0.86, 0.08);
  rightArm.name = 'rightArm';
  root.add(rightArm);

  // Head
  if (isAi) {
    const headShell = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.3, 0.32),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.25, metalness: 0.5 })
    );
    headShell.position.y = 1.38;
    headShell.castShadow = castShadow;
    root.add(headShell);

    // Distinct AI visor strip
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.1, 0.06),
      new THREE.MeshStandardMaterial({
        color: accentColor,
        emissive: accentColor,
        emissiveIntensity: actor.operationalStatus === 'paused' ? 0.08 : 0.6,
        roughness: 0.15,
      })
    );
    visor.position.set(0, 1.39, -0.15);
    root.add(visor);

    if (actor.avatarConfig.headStyle === 'halo') {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 8, 24), accentMat);
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 1.62;
      root.add(halo);
    }
  } else {
    // Human head + hair cap
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xe8c3a5, roughness: 0.72, metalness: 0.02 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 14), skinMat);
    head.position.y = 1.38;
    head.castShadow = castShadow;
    root.add(head);

    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 })
    );
    hair.position.y = 1.4;
    root.add(hair);
  }

  // Accessory
  if (actor.avatarConfig.accessory === 'headset') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.022, 6, 16, Math.PI), torsoMat);
    band.position.y = 1.4;
    root.add(band);
  } else if (actor.avatarConfig.accessory === 'badge') {
    const badge = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.12, 0.03),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
    );
    badge.position.set(0.11, 0.96, -0.15);
    root.add(badge);
  }

  // Status beacon above head ONLY when waiting_for_approval or failed (no fake animations when idle!)
  if (actor.operationalStatus === 'waiting_for_approval' || actor.operationalStatus === 'failed') {
    const beacon = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.12, 0),
      new THREE.MeshStandardMaterial({
        color: statusHex,
        emissive: statusHex,
        emissiveIntensity: 0.7,
        roughness: 0.2,
      })
    );
    beacon.position.y = 1.82;
    beacon.name = 'statusBeacon';
    root.add(beacon);
  }

  // Invisible raycast hit cylinder for effortless clicking
  const hitMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 1.85, 8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitMesh.position.y = 0.92;
  hitMesh.userData.hqSelection = {
    kind: actor.actorType,
    id: actor.id,
    label: actor.name,
  } satisfies Hq3DSelection;
  root.add(hitMesh);

  root.userData.hqSelection = {
    kind: actor.actorType,
    id: actor.id,
    label: actor.name,
  } satisfies Hq3DSelection;
  root.userData.actorStatus = actor.operationalStatus;

  return root;
}

export function VirtualHq3D({
  companyName,
  primaryColor,
  theme,
  reducedMotion,
  zones,
  actors,
  meetingRooms,
  pendingApprovalsCount,
  selectedId,
  onSelect,
  onWebglUnavailable,
}: VirtualHq3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string>('overview');
  const [dockExpanded, setDockExpanded] = useState<boolean>(true);
  const [contextLost, setContextLost] = useState<boolean>(false);
  const [webglFailed, setWebglFailed] = useState<boolean>(false);

  const cameraGoalRef = useRef<{
    pos: THREE.Vector3;
    target: THREE.Vector3;
    active: boolean;
  }>({
    pos: new THREE.Vector3(0, 29, 36),
    target: new THREE.Vector3(0, 0, 2),
    active: false,
  });

  const requestRenderRef = useRef<() => void>(() => {});
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const triggerPreset = (preset: CameraPreset) => {
    setActivePreset(preset.id);
    cameraGoalRef.current.pos.set(...preset.pos);
    cameraGoalRef.current.target.set(...preset.target);
    cameraGoalRef.current.active = true;
    requestRenderRef.current();
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    let isSoftwareGl = false;

    try {
      const probe = document.createElement('canvas');
      const probeGl =
        (probe.getContext('webgl2') as WebGL2RenderingContext | null) ||
        (probe.getContext('webgl') as WebGLRenderingContext | null);
      if (!probeGl) {
        setWebglFailed(true);
        onWebglUnavailable?.();
        return;
      }
      const debugExt = probeGl.getExtension('WEBGL_debug_renderer_info');
      const rendererStr = debugExt
        ? String(probeGl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL) || '')
        : '';
      isSoftwareGl = /swiftshader|llvmpipe|software|mesa/i.test(rendererStr);

      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: isSoftwareGl ? 'low-power' : 'high-performance',
        preserveDrawingBuffer: true,
      });
    } catch {
      setWebglFailed(true);
      onWebglUnavailable?.();
      return;
    }

    const width = Math.max(320, container.clientWidth);
    const height = Math.max(360, container.clientHeight);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = theme === 'dark' ? 1.05 : 1.08;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    const isDark = theme === 'dark';
    const bgColor = isDark ? 0x0b1220 : 0xe8eef6;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bgColor);
    scene.fog = new THREE.Fog(bgColor, 58, 125);

    // PMREM studio environment reflections
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.25, 220);
    camera.position.set(0, 29, 36);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.target.set(0, 0, 2);
    controls.minDistance = 8;
    controls.maxDistance = 68;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.minPolarAngle = 0.22;
    controls.update();

    // Architectural studio three-point lighting
    const hemi = new THREE.HemisphereLight(isDark ? 0x93c5fd : 0xf8fafc, isDark ? 0x1e293b : 0xcbd5e1, isDark ? 0.72 : 0.95);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, isDark ? 1.25 : 1.5);
    keyLight.position.set(22, 34, 24);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.width = 2048;
      keyLight.shadow.mapSize.height = 2048;
      keyLight.shadow.camera.near = 4;
      keyLight.shadow.camera.far = 95;
      keyLight.shadow.camera.left = -32;
      keyLight.shadow.camera.right = 32;
      keyLight.shadow.camera.top = 32;
      keyLight.shadow.camera.bottom = -32;
      keyLight.shadow.bias = -0.0004;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xdbeafe, isDark ? 0.45 : 0.55);
    fillLight.position.set(-24, 18, -18);
    scene.add(fillLight);

    const disposableTextures: THREE.Texture[] = [];
    const interactables: THREE.Object3D[] = [];
    const animatedAvatars: THREE.Group[] = [];

    // Main architectural concrete floor plate
    const floorTex = makeFloorGridTexture(isDark, maxAnisotropy);
    disposableTextures.push(floorTex);
    const floorPlate = new THREE.Mesh(
      new THREE.BoxGeometry(52, 0.5, 50),
      new THREE.MeshStandardMaterial({
        map: floorTex,
        roughness: 0.78,
        metalness: 0.05,
      })
    );
    floorPlate.position.set(0, -0.25, 3);
    floorPlate.receiveShadow = true;
    scene.add(floorPlate);

    // Outer perimeter architectural plinth & low glass balustrade
    const plinthMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x1e293b : 0xcbd5e1,
      roughness: 0.5,
      metalness: 0.2,
    });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(52, 3.8, 0.45), plinthMat);
    backWall.position.set(0, 1.9, -21.8);
    backWall.receiveShadow = true;
    scene.add(backWall);

    // Operational Wall Screens along Executive/Back Wall (clickable -> real platform modules!)
    const wallScreens: Array<{ x: number; title: string; subtitle: string; color: string; route: string }> = [
      {
        x: -10,
        title: 'APPROVAL CENTER',
        subtitle: `${pendingApprovalsCount} pending human gate(s)`,
        color: pendingApprovalsCount > 0 ? '#d97706' : '#059669',
        route: 'approvals',
      },
      {
        x: 0,
        title: companyName.toUpperCase(),
        subtitle: 'AI-FIRST AGENCY HEADQUARTERS',
        color: primaryColor,
        route: 'company',
      },
      {
        x: 10,
        title: 'CONTENT & PUBLISHING',
        subtitle: 'Open Studio & Queue',
        color: '#2563eb',
        route: 'content',
      },
    ];

    for (const scr of wallScreens) {
      const tex = makeSignTexture(scr.title, scr.subtitle, scr.color, true, maxAnisotropy);
      disposableTextures.push(tex);
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(6.8, 2.2, 0.16),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.6 })
      );
      frame.position.set(scr.x, 2.35, -21.45);
      scene.add(frame);

      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(6.4, 1.92),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.25 })
      );
      panel.position.set(scr.x, 2.35, -21.35);
      panel.userData.hqSelection = {
        kind: 'screen',
        id: `screen_${scr.route}`,
        label: scr.title,
        targetRoute: scr.route,
      } satisfies Hq3DSelection;
      scene.add(panel);
      interactables.push(panel);
    }

    // Build all Zones (Reception, Departments, Meeting Rooms)
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: isDark ? 0x38bdf8 : 0xbae6fd,
      transparent: true,
      opacity: isDark ? 0.2 : 0.28,
      roughness: 0.1,
      metalness: 0.05,
    });

    const actorsByStation = new Map<string, Hq3DActor>();
    for (const a of actors) {
      actorsByStation.set(a.worldPosition.stationCode, a);
    }

    for (const zone of zones) {
      const isSelected = selectedId === zone.id;
      const zoneColor = new THREE.Color(zone.colorHex || '#2563eb');
      const padColor = isDark ? 0x162033 : 0xf8fafc;

      // Zone carpet/floor pad at y = 0.03 (clean Y-offset above floor y=0)
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(zone.width, 0.06, zone.depth),
        new THREE.MeshStandardMaterial({
          color: isSelected ? zoneColor : padColor,
          roughness: 0.85,
          metalness: 0.02,
        })
      );
      pad.position.set(zone.x, 0.03, zone.z);
      pad.receiveShadow = true;
      pad.userData.hqSelection = {
        kind: zone.kind === 'meeting_room' ? 'meeting_room' : zone.kind === 'reception' ? 'reception' : 'department',
        id: zone.id,
        label: zone.name,
      } satisfies Hq3DSelection;
      scene.add(pad);
      interactables.push(pad);

      // Colored front border bar at y = 0.065
      const accentBar = new THREE.Mesh(
        new THREE.BoxGeometry(zone.width, 0.03, 0.22),
        new THREE.MeshStandardMaterial({
          color: zoneColor,
          emissive: zoneColor,
          emissiveIntensity: isSelected ? 0.45 : 0.12,
          roughness: 0.4,
        })
      );
      accentBar.position.set(zone.x, 0.065, zone.z + zone.depth / 2 - 0.11);
      scene.add(accentBar);

      // Zone Signage Plaque
      const activeRoom =
        zone.kind === 'meeting_room'
          ? meetingRooms.find((r) => r.id === zone.id)?.activeMeeting ?? null
          : null;
      const occupantCount = actors.filter((a) => a.worldPosition.zoneId === zone.id).length;
      const signSub =
        zone.kind === 'meeting_room'
          ? activeRoom
            ? `LIVE: ${activeRoom.title}`
            : 'Room Available · Click to Enter'
          : zone.kind === 'reception'
          ? `${companyName} Directory`
          : `${occupantCount} member${occupantCount === 1 ? '' : 's'} assigned`;

      const signTex = makeSignTexture(zone.name, signSub, zone.colorHex, isDark, maxAnisotropy);
      disposableTextures.push(signTex);
      const signMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(4.8, zone.width - 1), 1.05),
        new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.35 })
      );
      signMesh.position.set(zone.x, 0.08, zone.z + zone.depth / 2 - 0.72);
      signMesh.rotation.x = -Math.PI / 2;
      scene.add(signMesh);

      if (zone.kind === 'reception') {
        // Reception Counter + Brand Emblem Desk
        const counter = new THREE.Mesh(
          new THREE.BoxGeometry(5.6, 1.08, 1.15),
          new THREE.MeshStandardMaterial({ color: isDark ? 0x1e293b : 0xffffff, roughness: 0.3, metalness: 0.1 })
        );
        counter.position.set(zone.x, 0.54, zone.z - 0.8);
        counter.castShadow = !isSoftwareGl;
        scene.add(counter);

        const brandRibbon = new THREE.Mesh(
          new THREE.BoxGeometry(5.64, 0.2, 0.08),
          new THREE.MeshStandardMaterial({ color: primaryColor, roughness: 0.3 })
        );
        brandRibbon.position.set(zone.x, 0.65, zone.z - 0.2);
        scene.add(brandRibbon);
      } else if (zone.kind === 'meeting_room') {
        // Glass Partition Walls (3 sides open at front entrance)
        const wallH = 2.4;
        const backGlass = new THREE.Mesh(new THREE.BoxGeometry(zone.width - 0.1, wallH, 0.08), glassMat);
        backGlass.position.set(zone.x, wallH / 2 + 0.06, zone.z - zone.depth / 2 + 0.05);
        scene.add(backGlass);

        const leftGlass = new THREE.Mesh(new THREE.BoxGeometry(0.08, wallH, zone.depth - 0.1), glassMat);
        leftGlass.position.set(zone.x - zone.width / 2 + 0.05, wallH / 2 + 0.06, zone.z);
        scene.add(leftGlass);

        const rightGlass = new THREE.Mesh(new THREE.BoxGeometry(0.08, wallH, zone.depth - 0.1), glassMat);
        rightGlass.position.set(zone.x + zone.width / 2 - 0.05, wallH / 2 + 0.06, zone.z);
        scene.add(rightGlass);

        // Conference Table
        const tableTop = new THREE.Mesh(
          new THREE.BoxGeometry(3.4, 0.1, 1.85),
          new THREE.MeshStandardMaterial({
            color: isDark ? 0x1e293b : 0xe2e8f0,
            roughness: 0.32,
            metalness: 0.15,
          })
        );
        tableTop.position.set(zone.x, 0.76, zone.z - 0.25);
        tableTop.castShadow = !isSoftwareGl;
        tableTop.receiveShadow = true;
        tableTop.userData.hqSelection = {
          kind: 'meeting_room',
          id: zone.id,
          label: zone.name,
        } satisfies Hq3DSelection;
        scene.add(tableTop);
        interactables.push(tableTop);

        const pedestal = new THREE.Mesh(
          new THREE.BoxGeometry(1.8, 0.72, 0.65),
          new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.4 })
        );
        pedestal.position.set(zone.x, 0.36, zone.z - 0.25);
        scene.add(pedestal);

        // Live Meeting Status Strip on conference table center
        const statusStrip = new THREE.Mesh(
          new THREE.BoxGeometry(2.2, 0.03, 0.18),
          new THREE.MeshStandardMaterial({
            color: activeRoom ? 0x4f46e5 : 0x64748b,
            emissive: activeRoom ? 0x4f46e5 : 0x000000,
            emissiveIntensity: activeRoom ? 0.65 : 0,
          })
        );
        statusStrip.position.set(zone.x, 0.82, zone.z - 0.25);
        scene.add(statusStrip);
      } else {
        // Department Workstations (show workstations for assigned slots, minimum 2 per department)
        const visibleStations = zone.workstations.slice(0, Math.max(2, Math.min(4, occupantCount || 2)));
        for (const ws of visibleStations) {
          const assignee = actorsByStation.get(ws.code);
          const screenTint = assignee
            ? assignee.operationalStatus === 'working'
              ? 0x3b82f6
              : assignee.operationalStatus === 'waiting_for_approval'
              ? 0xf59e0b
              : assignee.operationalStatus === 'failed'
              ? 0xef4444
              : 0x334155
            : 0x1e293b;
          const desk = buildWorkstationGroup(ws.x, ws.z - 0.35, ws.rotY, screenTint, isDark, !isSoftwareGl);
          scene.add(desk);
        }
      }
    }

    // Place all real Human & AI Avatars
    for (const actor of actors) {
      const avatar = buildAvatarGroup(actor, !isSoftwareGl);
      const isSeatedInMeeting = actor.operationalStatus === 'in_meeting';
      const offsetZ = isSeatedInMeeting ? 0 : actor.worldPosition.rotY === 0 ? 0.35 : -0.35;
      avatar.position.set(actor.worldPosition.x, 0, actor.worldPosition.z + offsetZ);
      avatar.rotation.y = actor.worldPosition.rotY;
      scene.add(avatar);
      interactables.push(avatar);
      if (
        actor.operationalStatus === 'working' ||
        actor.operationalStatus === 'validating' ||
        actor.operationalStatus === 'waiting_for_approval' ||
        actor.operationalStatus === 'failed'
      ) {
        animatedAvatars.push(avatar);
      }
    }

    // Raycasting & Pointer Interaction (throttled hover, click-drag threshold)
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };
    let lastHoverTs = 0;

    const resolveSelection = (obj: THREE.Object3D | null): Hq3DSelection | null => {
      let cur: THREE.Object3D | null = obj;
      while (cur) {
        if (cur.userData?.hqSelection) return cur.userData.hqSelection as Hq3DSelection;
        cur = cur.parent;
      }
      return null;
    };

    const updatePointer = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (ev: PointerEvent) => {
      pointerDownPos = { x: ev.clientX, y: ev.clientY };
      // Cancel preset lerp if user starts orbiting manually
      cameraGoalRef.current.active = false;
    };

    const onPointerUp = (ev: PointerEvent) => {
      const dist = Math.hypot(ev.clientX - pointerDownPos.x, ev.clientY - pointerDownPos.y);
      if (dist > 6) return;
      updatePointer(ev);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(interactables, true);
      if (hits.length > 0) {
        const sel = resolveSelection(hits[0].object);
        if (sel) {
          onSelectRef.current(sel);
        }
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverTs < 60) return;
      lastHoverTs = now;
      updatePointer(ev);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(interactables, true);
      if (hits.length > 0) {
        const sel = resolveSelection(hits[0].object);
        if (sel) {
          renderer.domElement.style.cursor = 'pointer';
          setHoveredLabel(sel.label);
          return;
        }
      }
      renderer.domElement.style.cursor = 'grab';
      setHoveredLabel(null);
    };

    const onContextLost = (ev: Event) => {
      ev.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
      requestRender();
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    // Paced on-demand render loop (respects software WebGL & reducedMotion)
    let rafId = 0;
    let disposed = false;
    let renderScheduled = false;
    const clock = new THREE.Clock();

    const afterDraw = (next: () => void) => {
      if (!isSoftwareGl) {
        rafId = requestAnimationFrame(next);
        return;
      }
      const gl = renderer.getContext();
      if (gl instanceof WebGL2RenderingContext) {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (sync) {
          gl.flush();
          const poll = () => {
            if (disposed) {
              gl.deleteSync(sync);
              return;
            }
            const status = gl.clientWaitSync(sync, 0, 0);
            if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) {
              gl.deleteSync(sync);
              rafId = requestAnimationFrame(next);
            } else {
              setTimeout(poll, 16);
            }
          };
          setTimeout(poll, 16);
          return;
        }
      }
      rafId = requestAnimationFrame(next);
    };

    const drawFrame = () => {
      renderScheduled = false;
      if (disposed) return;

      const dt = Math.min(0.05, clock.getDelta());
      const elapsed = clock.elapsedTime;
      let keepAnimating = false;

      if (cameraGoalRef.current.active) {
        if (reducedMotion) {
          camera.position.copy(cameraGoalRef.current.pos);
          controls.target.copy(cameraGoalRef.current.target);
          cameraGoalRef.current.active = false;
        } else {
          camera.position.x = THREE.MathUtils.damp(camera.position.x, cameraGoalRef.current.pos.x, 6, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, cameraGoalRef.current.pos.y, 6, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, cameraGoalRef.current.pos.z, 6, dt);
          controls.target.x = THREE.MathUtils.damp(controls.target.x, cameraGoalRef.current.target.x, 6, dt);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, cameraGoalRef.current.target.y, 6, dt);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, cameraGoalRef.current.target.z, 6, dt);
          if (
            camera.position.distanceTo(cameraGoalRef.current.pos) < 0.08 &&
            controls.target.distanceTo(cameraGoalRef.current.target) < 0.08
          ) {
            cameraGoalRef.current.active = false;
          } else {
            keepAnimating = true;
          }
        }
      }

      // Honest state-driven motion: ONLY animate avatars whose backend state is genuinely active/alerting
      if (!reducedMotion && animatedAvatars.length > 0) {
        for (let i = 0; i < animatedAvatars.length; i += 1) {
          const av = animatedAvatars[i];
          const status = av.userData.actorStatus as OperationalStatus;
          if (status === 'working' || status === 'validating') {
            const leftArm = av.getObjectByName('leftArm');
            const rightArm = av.getObjectByName('rightArm');
            if (leftArm && rightArm) {
              leftArm.rotation.x = -0.6 + Math.sin(elapsed * 7 + i) * 0.14;
              rightArm.rotation.x = -0.6 + Math.cos(elapsed * 7 + i) * 0.14;
            }
          }
          const beacon = av.getObjectByName('statusBeacon');
          if (beacon) {
            beacon.rotation.y = elapsed * 2.2;
          }
        }
        keepAnimating = true;
      }

      controls.update();
      renderer.render(scene, camera);

      if (keepAnimating && !renderScheduled) {
        renderScheduled = true;
        afterDraw(drawFrame);
      }
    };

    const requestRender = () => {
      if (disposed || renderScheduled) return;
      renderScheduled = true;
      afterDraw(drawFrame);
    };
    requestRenderRef.current = requestRender;

    controls.addEventListener('change', requestRender);

    const resizeObserver = new ResizeObserver(() => {
      if (disposed || !container) return;
      const w = Math.max(320, container.clientWidth);
      const h = Math.max(360, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    });
    resizeObserver.observe(container);

    // Draw initial frame immediately
    drawFrame();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      disposableTextures.forEach((t) => t.dispose());
      envTarget.dispose();
      pmrem.dispose();
      renderer.dispose();
    };
  }, [companyName, primaryColor, theme, reducedMotion, zones, actors, meetingRooms, pendingApprovalsCount, selectedId, onWebglUnavailable]);

  if (webglFailed) {
    return (
      <div className="h-[520px] rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
        <Layers className="w-8 h-8 text-slate-400 mb-3" />
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          3D WebGL Renderer Unavailable on This Device
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-md">
          Switch to the 2D Operational Floor Map tab above for full interactive headquarters navigation.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[560px] lg:h-[620px] rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-200 dark:bg-slate-950 select-none">
      <div ref={containerRef} className="w-full h-full" aria-label="Interactive 3D Virtual Company Headquarters" />

      {/* Top-Left Minimal Context Chip (No backdrop-filter over WebGL!) */}
      <div className="absolute top-3 left-3 z-10 pointer-events-none flex items-center gap-2">
        <div className="bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 shadow-xs">
          {hoveredLabel ? `Inspect: ${hoveredLabel}` : 'Drag to orbit · Scroll to zoom · Click any avatar, room, or screen'}
        </div>
      </div>

      {contextLost && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/80 text-white text-sm">
          Restoring 3D WebGL context...
        </div>
      )}

      {/* Collapsible Bottom Camera & Zone Control Dock (Zero side clutter) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 max-w-[94%]">
        <div className="bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm px-2.5 py-2 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
              <Compass className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span>HQ Camera</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => triggerPreset(CAMERA_PRESETS[0])}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Reset camera overview"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
              <button
                type="button"
                onClick={() => setDockExpanded((v) => !v)}
                aria-label={dockExpanded ? 'Collapse camera controls' : 'Expand camera controls'}
                className="p-1 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {dockExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {dockExpanded && (
            <div className="flex flex-wrap items-center gap-1.5">
              {CAMERA_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => triggerPreset(preset)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    activePreset === preset.id
                      ? 'bg-blue-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Camera className="w-3 h-3" aria-hidden="true" />
                  {preset.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
