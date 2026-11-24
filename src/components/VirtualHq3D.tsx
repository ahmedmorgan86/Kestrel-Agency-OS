import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinnedModel } from 'three/addons/utils/SkeletonUtils.js';
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

interface HumanoidAsset {
  slug: string;
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

const EMPLOYEE_ASSETS = Array.from({ length: 8 }, (_, index) => `morgan-colleague-${String(index + 1).padStart(2, '0')}`);

interface AnimatedEmployee {
  root: THREE.Group;
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  desiredAction: THREE.AnimationAction;
  walkAction: THREE.AnimationAction | null;
  animationPhase: number;
  startPosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  startRotationY: number;
  targetRotationY: number;
  transitionDuration: number;
  transitionProgress: number;
  inTransition: boolean;
}

const CAMERA_PRESETS: CameraPreset[] = [
  { id: 'atrium', label: 'البهو', pos: [0, 8, 7], target: [0, 1.35, 22] },
  { id: 'people', label: 'مساحة الفريق', pos: [0, 8, 21], target: [0, 1.2, 6] },
  { id: 'overview', label: 'نظرة عامة', pos: [0, 13, 32], target: [0, 1.1, 5] },
  { id: 'reception', label: 'الاستقبال', pos: [0, 7, 34], target: [0, 1.2, 19] },
  { id: 'executive', label: 'الإدارة', pos: [0, 8, 4], target: [0, 1.4, -15] },
  { id: 'creative', label: 'استوديو الإنتاج', pos: [-14, 8.5, 17], target: [-6, 1, 3] },
  { id: 'meetings', label: 'غرف الاجتماعات', pos: [-19, 8.5, -2], target: [-15, 1, -15] },
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

function stableActorHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

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
    ctx.font = '700 32px "Cairo", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillText(title.slice(0, 26), canvas.width - 24, 68);

    ctx.fillStyle = darkSurface ? '#94a3b8' : '#475569';
    ctx.font = '500 20px "Cairo", system-ui, sans-serif';
    ctx.fillText(subtitle.slice(0, 38), canvas.width - 24, 118);
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
    ctx.fillStyle = dark ? '#252a30' : '#82786c';
    ctx.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const shade = (row * 7 + col * 11) % 9;
        ctx.fillStyle = dark ? `rgba(255,255,255,${0.008 + shade * 0.001})` : `rgba(255,255,255,${0.008 + shade * 0.001})`;
        ctx.fillRect(col * 128 + 2, row * 128 + 2, 124, 124);
        ctx.strokeStyle = dark ? 'rgba(180,195,205,0.14)' : 'rgba(99,83,65,0.18)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(col * 128 + 1, row * 128 + 1, 126, 126);
        ctx.strokeStyle = dark ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.18)';
        ctx.beginPath();
        ctx.moveTo(col * 128 + 14, row * 128 + 88 + (shade % 3) * 8);
        ctx.lineTo(col * 128 + 74, row * 128 + 84 + (shade % 3) * 8);
        ctx.lineTo(col * 128 + 116, row * 128 + 89 + (shade % 3) * 8);
        ctx.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.8, 3.6);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

function makeCityBackdropTexture(anisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, '#162536');
    sky.addColorStop(0.48, '#405365');
    sky.addColorStop(0.78, '#a19f93');
    sky.addColorStop(1, '#49545a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Layered silhouettes and warm office windows suggest an inhabited city beyond the glass facade.
    const drawLayer = (seed: number, baseY: number, baseColor: string, minWidth: number, maxWidth: number, minHeight: number, maxHeight: number, windowAlpha: number) => {
      let x = -12;
      let index = 0;
      while (x < canvas.width + 24) {
        const wave = Math.abs(Math.sin(seed + index * 12.9898));
        const width = minWidth + Math.floor(wave * (maxWidth - minWidth));
        const height = minHeight + Math.floor(Math.abs(Math.sin(seed + index * 7.13)) * (maxHeight - minHeight));
        ctx.fillStyle = baseColor;
        ctx.fillRect(x, baseY - height, width, height + 4);
        if (width > 24) {
          for (let wx = x + 8; wx < x + width - 5; wx += 15) {
            for (let wy = baseY - height + 12; wy < baseY - 8; wy += 19) {
              const lit = Math.abs(Math.sin(wx * 0.03 + wy * 0.017 + seed));
              if (lit > 0.44) {
                ctx.fillStyle = `rgba(255,211,145,${windowAlpha * lit})`;
                ctx.fillRect(wx, wy, 5, 8);
              }
            }
          }
        }
        x += width + 4;
        index += 1;
      }
    };
    drawLayer(1.8, 594, '#59666b', 28, 92, 90, 250, 0.28);
    drawLayer(8.4, 672, '#303b43', 38, 128, 135, 360, 0.62);
    ctx.fillStyle = '#27343b';
    ctx.fillRect(0, 666, canvas.width, 102);
    const horizon = ctx.createLinearGradient(0, 640, 0, 768);
    horizon.addColorStop(0, 'rgba(226,179,113,0)');
    horizon.addColorStop(1, 'rgba(230,189,136,0.3)');
    ctx.fillStyle = horizon;
    ctx.fillRect(0, 640, canvas.width, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
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
    color: dark ? 0x382f28 : 0x8a7055,
    roughness: 0.62,
    metalness: 0.04,
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
    color: dark ? 0x202b36 : 0x2b343b,
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
  lower.visible = isAi;
  lower.castShadow = castShadow;
  root.add(lower);

  // Torso
  const torsoGeo = isAi
    ? new THREE.CylinderGeometry(0.25, 0.18, 0.58, 6)
    : new THREE.BoxGeometry(0.46, 0.56, 0.26);
  const torso = new THREE.Mesh(torsoGeo, accentMat);
  torso.position.y = 0.88;
  torso.visible = isAi;
  torso.castShadow = castShadow;
  root.add(torso);

  // Articulated arms (used strictly for honest typing motion ONLY when operationalStatus === 'working')
  const armGeo = new THREE.BoxGeometry(0.11, 0.38, 0.11);
  const leftArm = new THREE.Mesh(armGeo, torsoMat);
  leftArm.position.set(-0.3, 0.86, 0.08);
  leftArm.name = 'leftArm';
  leftArm.visible = isAi;
  root.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, torsoMat);
  rightArm.position.set(0.3, 0.86, 0.08);
  rightArm.name = 'rightArm';
  rightArm.visible = isAi;
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
    const seed = stableActorHash(actor.id);
    const skinTones = ['#f0c7a5', '#d7a27c', '#bd805f', '#8d5d45', '#e4b28c', '#c48d6b'];
    const hairTones = ['#211b18', '#3c2c24', '#5b3827', '#252b34', '#6b4a35'];
    const skinMat = new THREE.MeshStandardMaterial({ color: skinTones[seed % skinTones.length], roughness: 0.82 });
    const hairMat = new THREE.MeshStandardMaterial({ color: hairTones[(seed >>> 4) % hairTones.length], roughness: 0.88 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: '#e7e5e4', roughness: 0.8 });
    const trouserMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.84 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.72 });
    const addMesh = (geometry: THREE.BufferGeometry, material: THREE.Material, name: string, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.position.set(x, y, z);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      root.add(mesh);
      return mesh;
    };

    // Fully three-dimensional low-poly people: face, hair, jacket, hands, trousers, and shoes.
    addMesh(new THREE.CylinderGeometry(0.075, 0.085, 0.16, 10), skinMat, 'humanNeck', 0, 1.29, 0);
    const body = addMesh(new THREE.CapsuleGeometry(0.2, 0.38, 4, 12), accentMat, 'humanJacket', 0, 0.99, 0);
    body.scale.set(1.05, 1, 0.8);
    addMesh(new THREE.CapsuleGeometry(0.13, 0.25, 3, 10), shirtMat, 'humanShirt', 0, 1.01, -0.115);

    const head = new THREE.Group();
    head.name = 'humanHead';
    head.position.y = 1.51;
    root.add(head);
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.145, 18, 14), skinMat);
    headMesh.name = 'humanFace';
    headMesh.scale.set(0.92, 1.08, 0.88);
    headMesh.castShadow = castShadow;
    head.add(headMesh);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.151, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.65), hairMat);
    hair.name = 'humanHair';
    hair.position.y = 0.034;
    hair.castShadow = castShadow;
    head.add(hair);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshStandardMaterial({ color: '#263238', roughness: 0.4 }));
      eye.position.set(side * 0.047, 0.006, -0.124);
      head.add(eye);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), skinMat);
      ear.position.set(side * 0.134, -0.015, 0);
      head.add(ear);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), skinMat);
    nose.position.set(0, -0.026, -0.139);
    head.add(nose);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.009, 0.008), new THREE.MeshStandardMaterial({ color: '#7a3f3d', roughness: 0.7 }));
    mouth.position.set(0, -0.072, -0.127);
    head.add(mouth);

    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.name = side < 0 ? 'leftArm' : 'rightArm';
      arm.position.set(side * 0.22, 1.16, 0);
      root.add(arm);
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.2, 3, 8), accentMat);
      sleeve.position.y = -0.16;
      sleeve.rotation.z = side * -0.12;
      sleeve.castShadow = castShadow;
      arm.add(sleeve);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skinMat);
      hand.position.set(side * -0.035, -0.34, -0.01);
      hand.name = 'humanHand';
      arm.add(hand);

      const leg = new THREE.Group();
      leg.name = side < 0 ? 'leftLeg' : 'rightLeg';
      leg.position.set(side * 0.085, 0.62, 0);
      root.add(leg);
      const trouser = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.23, 3, 8), trouserMat);
      trouser.position.y = -0.19;
      trouser.castShadow = castShadow;
      leg.add(trouser);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.24), shoeMat);
      shoe.position.set(0, -0.4, -0.055);
      shoe.castShadow = castShadow;
      leg.add(shoe);
    }
  }

  // Accessory
  if (isAi && actor.avatarConfig.accessory === 'headset') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.022, 6, 16, Math.PI), torsoMat);
    band.position.y = 1.4;
    root.add(band);
  } else if (isAi && actor.avatarConfig.accessory === 'badge') {
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

function buildRiggedHumanGroup(
  actor: Hq3DActor,
  asset: HumanoidAsset,
  castShadow: boolean,
  startsWalking: boolean
) {
  const root = new THREE.Group();
  const model = cloneSkinnedModel(asset.scene);
  model.name = `humanModel:${actor.id}`;
  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = castShadow;
      object.receiveShadow = true;
      object.frustumCulled = false;
    }
  });
  root.add(model);

  const statusHex = STATUS_COLORS[actor.operationalStatus] ?? 0x64748b;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.42, 24),
    new THREE.MeshStandardMaterial({
      color: statusHex,
      emissive: statusHex,
      emissiveIntensity: actor.operationalStatus === 'idle' || actor.operationalStatus === 'paused' ? 0.04 : 0.22,
      roughness: 0.6,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.025;
  root.add(ring);

  if (actor.operationalStatus === 'waiting_for_approval' || actor.operationalStatus === 'failed') {
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 12, 8),
      new THREE.MeshStandardMaterial({ color: statusHex, emissive: statusHex, emissiveIntensity: 0.7 })
    );
    beacon.position.y = 1.92;
    beacon.name = 'statusBeacon';
    root.add(beacon);
  }

  const hitMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 1.85, 10),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitMesh.position.y = 0.92;
  hitMesh.userData.hqSelection = { kind: actor.actorType, id: actor.id, label: actor.name } satisfies Hq3DSelection;
  root.add(hitMesh);
  root.userData.hqSelection = { kind: actor.actorType, id: actor.id, label: actor.name } satisfies Hq3DSelection;
  root.userData.actorStatus = actor.operationalStatus;

  const mixer = new THREE.AnimationMixer(model);
  const shouldSit = ['working', 'validating', 'in_meeting', 'waiting_for_approval'].includes(actor.operationalStatus);
  const clip = actor.operationalStatus === 'queued'
    ? asset.animations.find((item) => item.name.toLowerCase() === 'walk')
    : shouldSit
      ? asset.animations.find((item) => item.name.toLowerCase().includes('sit'))
      : asset.animations.find((item) => item.name.toLowerCase() === 'idle') ?? asset.animations[0];
  const desiredClip = clip ?? asset.animations.find((item) => item.name.toLowerCase() === 'idle') ?? asset.animations[0];
  const desiredAction = desiredClip ? mixer.clipAction(desiredClip) : mixer.clipAction(new THREE.AnimationClip('idle', 1, []));
  const walkClip = asset.animations.find((item) => item.name.toLowerCase() === 'walk');
  const walkAction = walkClip ? mixer.clipAction(walkClip) : null;
  const animationPhase = (stableActorHash(`${actor.id}:animation-phase`) / 0xffffffff);
  if (startsWalking && walkAction) {
    walkAction.time = walkAction.getClip().duration * animationPhase;
    walkAction.play();
  } else {
    desiredAction.time = desiredAction.getClip().duration * animationPhase;
    desiredAction.play();
  }
  return { root, model, mixer, desiredAction, walkAction, animationPhase };
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
  const [activePreset, setActivePreset] = useState<string>('people');
  const [dockExpanded, setDockExpanded] = useState<boolean>(true);
  const [contextLost, setContextLost] = useState<boolean>(false);
  const [webglFailed, setWebglFailed] = useState<boolean>(false);
  const [humanoidAssets, setHumanoidAssets] = useState<HumanoidAsset[]>([]);
  const actorPositionsRef = useRef(new Map<string, { position: THREE.Vector3; rotationY: number }>());

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    let active = true;
    void Promise.allSettled(
      EMPLOYEE_ASSETS.map(async (slug) => {
        const gltf = await loader.loadAsync(`/assets/avatars/${slug}.glb`);
        return { slug, scene: gltf.scene, animations: gltf.animations } satisfies HumanoidAsset;
      })
    ).then((results) => {
      if (!active) return;
      const loaded = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
      if (loaded.length) setHumanoidAssets(loaded);
      if (loaded.length !== EMPLOYEE_ASSETS.length) {
        console.warn('Some licensed 3D employee models did not load; using the built-in fallback model.');
      }
    });
    return () => { active = false; };
  }, []);

  const cameraGoalRef = useRef<{
    pos: THREE.Vector3;
    target: THREE.Vector3;
    active: boolean;
  }>({
    pos: new THREE.Vector3(0, 8, 21),
    target: new THREE.Vector3(0, 1.2, 6),
    active: false,
  });

  const requestRenderRef = useRef<() => void>(() => {});
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const triggerPreset = (preset: CameraPreset) => {
    setActivePreset(preset.id);
    let position: [number, number, number] = preset.pos;
    let target: [number, number, number] = preset.target;
    if (preset.id === 'meetings') {
      const activeRoom = meetingRooms.find((room) => room.activeMeeting);
      const roomZone = activeRoom ? zones.find((zone) => zone.id === activeRoom.id) : null;
      if (roomZone) {
        // Follow the room that is actually hosting the active meeting, even when it is not the first room alphabetically.
        position = [roomZone.x - 2, 8.5, roomZone.z + 11];
        target = [roomZone.x, 1, roomZone.z];
      }
    }
    cameraGoalRef.current.pos.set(...position);
    cameraGoalRef.current.target.set(...target);
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
    const bgColor = isDark ? 0x10161d : 0x202934;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bgColor);
    scene.fog = new THREE.Fog(bgColor, 58, 125);

    // PMREM studio environment reflections
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.25, 220);
    const selectedActor = actors.find((actor) => actor.id === selectedId);
    camera.position.set(
      selectedActor?.worldPosition.x ?? 0,
      selectedActor ? 5.5 : 8,
      selectedActor ? selectedActor.worldPosition.z + 8.5 : 21
    );

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.target.set(
      selectedActor?.worldPosition.x ?? 0,
      selectedActor ? 0.95 : 1.2,
      selectedActor?.worldPosition.z ?? 6
    );
    controls.minDistance = 8;
    controls.maxDistance = 68;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.minPolarAngle = 0.22;
    controls.update();

    // Architectural studio three-point lighting
    const hemi = new THREE.HemisphereLight(isDark ? 0x9bb7d0 : 0xe6eff6, isDark ? 0x11161c : 0x6b655c, isDark ? 0.8 : 0.72);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffe1bd, isDark ? 2.1 : 1.65);
    keyLight.position.set(14, 28, 30);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.width = 2048;
      keyLight.shadow.mapSize.height = 2048;
      keyLight.shadow.camera.near = 4;
      keyLight.shadow.camera.far = 95;
      keyLight.shadow.camera.left = -28;
      keyLight.shadow.camera.right = 28;
      keyLight.shadow.camera.top = 30;
      keyLight.shadow.camera.bottom = -30;
      keyLight.shadow.bias = -0.0004;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xb9d8ed, isDark ? 0.72 : 0.48);
    fillLight.position.set(-25, 18, -12);
    scene.add(fillLight);

    const atriumLight = new THREE.PointLight(0xffc98f, isDark ? 4.5 : 2.8, 30, 2);
    atriumLight.position.set(0, 3.4, 15);
    scene.add(atriumLight);
    const studioLight = new THREE.PointLight(0x8ed8e0, isDark ? 2.6 : 1.6, 24, 2);
    studioLight.position.set(-8, 3.1, 0);
    scene.add(studioLight);

    const disposableTextures: THREE.Texture[] = [];
    const interactables: THREE.Object3D[] = [];
    const animatedAvatars: THREE.Group[] = [];
    const animatedEmployees: AnimatedEmployee[] = [];
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

    const foundation = new THREE.Mesh(
      new THREE.BoxGeometry(52.8, 0.52, 50.8),
      new THREE.MeshStandardMaterial({ color: isDark ? 0x111923 : 0x4c5053, roughness: 0.42, metalness: 0.34 })
    );
    foundation.position.set(0, -0.58, 3);
    foundation.receiveShadow = true;
    scene.add(foundation);

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

    // Slim architectural mullions and planted corners give the open plan a finished tech-campus feel.
    const frameMat = new THREE.MeshStandardMaterial({ color: isDark ? 0x334155 : 0x64748b, metalness: 0.72, roughness: 0.28 });
    for (const x of [-24.8, -12.4, 0, 12.4, 24.8]) {
      const column = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.7, 0.22), frameMat);
      column.position.set(x, 1.85, 27.55);
      column.castShadow = !isSoftwareGl;
      scene.add(column);
    }
    const facadeGlass = new THREE.MeshPhysicalMaterial({
      color: isDark ? 0x658394 : 0x99b5c0,
      transparent: true,
      opacity: 0.22,
      roughness: 0.16,
      metalness: 0.18,
      transmission: 0.12,
      thickness: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const facadeRailMat = new THREE.MeshStandardMaterial({ color: isDark ? 0x26343d : 0x56616a, metalness: 0.78, roughness: 0.24 });
    // Full height glazed entrance wall with evenly spaced mullions.
    for (let bay = 0; bay < 4; bay += 1) {
      const centerX = -18.6 + bay * 12.4;
      const pane = new THREE.Mesh(new THREE.BoxGeometry(12.1, 3.58, 0.07), facadeGlass);
      pane.position.set(centerX, 2.03, 27.55);
      scene.add(pane);
      for (const localX of [-5.95, -3, 0, 3, 5.95]) {
        const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.055, 3.75, 0.13), facadeRailMat);
        mullion.position.set(centerX + localX, 1.96, 27.5);
        scene.add(mullion);
      }
    }
    for (const y of [0.2, 3.8]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(49.8, 0.12, 0.16), facadeRailMat);
      rail.position.set(0, y, 27.5);
      scene.add(rail);
    }

    // Wraparound glass at the two long elevations; dark steel rails add real architectural depth.
    for (const side of [-1, 1]) {
      const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.07, 3.55, 49), facadeGlass);
      sideGlass.position.set(side * 25.65, 2, 3);
      scene.add(sideGlass);
      for (let bay = 0; bay <= 8; bay += 1) {
        const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.8, 0.13), facadeRailMat);
        mullion.position.set(side * 25.62, 1.95, -21.5 + bay * 6.1);
        scene.add(mullion);
      }
      for (const y of [0.2, 3.8]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 49.7), facadeRailMat);
        rail.position.set(side * 25.62, y, 3);
        scene.add(rail);
      }
    }
    const cityTexture = makeCityBackdropTexture(maxAnisotropy);
    disposableTextures.push(cityTexture);
    const skyline = new THREE.Mesh(
      new THREE.PlaneGeometry(210, 74),
      new THREE.MeshBasicMaterial({ map: cityTexture, side: THREE.DoubleSide, toneMapped: false })
    );
    skyline.position.set(0, 19, 65);
    skyline.rotation.y = Math.PI;
    scene.add(skyline);

    const planterMat = new THREE.MeshStandardMaterial({ color: isDark ? 0x1e293b : 0x475569, roughness: 0.72 });
    const leafMat = new THREE.MeshStandardMaterial({ color: isDark ? 0x16a085 : 0x238b70, roughness: 0.82 });
    for (const [x, z] of [[-22, 24], [22, 24], [-23, -18], [23, -18]] as const) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.58, 0.72, 12), planterMat);
      pot.position.set(x, 0.36, z);
      pot.castShadow = !isSoftwareGl;
      scene.add(pot);
      for (let leaf = 0; leaf < 5; leaf += 1) {
        const angle = (leaf / 5) * Math.PI * 2;
        const foliage = new THREE.Mesh(new THREE.ConeGeometry(0.24, 1.55, 7), leafMat);
        foliage.position.set(x + Math.cos(angle) * 0.32, 1.42, z + Math.sin(angle) * 0.32);
        foliage.rotation.z = Math.cos(angle) * -0.28;
        foliage.rotation.x = Math.sin(angle) * 0.28;
        foliage.castShadow = !isSoftwareGl;
        scene.add(foliage);
      }
    }

    // Operational Wall Screens along Executive/Back Wall (clickable -> real platform modules!)
    const wallScreens: Array<{ x: number; title: string; subtitle: string; color: string; route: string }> = [
      {
        x: -10,
        title: 'مركز الموافقات',
        subtitle: `${pendingApprovalsCount} محتوى بانتظار مراجعتك`,
        color: pendingApprovalsCount > 0 ? '#d97706' : '#059669',
        route: 'approvals',
      },
      {
        x: 0,
        title: companyName.toUpperCase(),
        subtitle: 'تقنية · محتوى · إبداع',
        color: primaryColor,
        route: 'company',
      },
      {
        x: 10,
        title: 'تشغيل المحتوى',
        subtitle: 'الفرق · الأنظمة · الإنتاج',
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
      const padColor = isDark ? 0x202832 : 0xb2a28e;

      // Zone carpet/floor pad at y = 0.03 (clean Y-offset above floor y=0)
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(zone.width, 0.06, zone.depth),
        new THREE.MeshStandardMaterial({
          color: isSelected ? zoneColor : padColor,
          roughness: 0.94,
          metalness: 0.01,
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
        new THREE.BoxGeometry(zone.width, 0.025, 0.09),
        new THREE.MeshStandardMaterial({
          color: zoneColor.clone().lerp(new THREE.Color(isDark ? 0x34434a : 0x8c7860), 0.58),
          emissive: zoneColor,
          emissiveIntensity: isSelected ? 0.22 : 0.035,
          roughness: 0.4,
        })
      );
      accentBar.position.set(zone.x, 0.065, zone.z + zone.depth / 2 - 0.045);
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
            ? `اجتماع جارٍ: ${activeRoom.title}`
            : 'الغرفة متاحة · اختر لفتحها'
          : zone.kind === 'reception'
          ? `${companyName} · استقبال الشركة`
          : zone.kind === 'break_area'
          ? 'مساحة راحة الفريق'
          : zone.kind === 'approval_waiting'
          ? `${occupantCount} ينتظرون المراجعة`
          : `${occupantCount} عضو في القسم`;

      const signTex = makeSignTexture(zone.name, signSub, zone.colorHex, isDark, maxAnisotropy);
      disposableTextures.push(signTex);
      const signMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(3.2, zone.width - 1), 1),
        new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.35 })
      );
      const signWidth = Math.min(3.2, zone.width - 1);
      const signZ = zone.z + zone.depth / 2 - 0.18;
      signMesh.position.set(zone.x, zone.kind === 'meeting_room' ? 2.78 : 2.52, signZ);
      signMesh.rotation.y = Math.PI;
      scene.add(signMesh);
      const signFrame = new THREE.Mesh(
        new THREE.BoxGeometry(signWidth + 0.12, 1.12, 0.09),
        new THREE.MeshStandardMaterial({ color: isDark ? 0x101923 : 0x343b40, metalness: 0.52, roughness: 0.34 })
      );
      signFrame.position.set(zone.x, signMesh.position.y, signZ + 0.035);
      scene.add(signFrame);
      signMesh.position.z = signZ - 0.02;
      if (zone.kind === 'department' || zone.kind === 'executive' || zone.kind === 'reception') {
        for (const postX of [-signWidth * 0.42, signWidth * 0.42]) {
          const signPost = new THREE.Mesh(new THREE.BoxGeometry(0.055, signMesh.position.y - 0.55, 0.055), facadeRailMat);
          signPost.position.set(zone.x + postX, (signMesh.position.y - 0.55) / 2, signZ);
          scene.add(signPost);
        }
      }

      if (zone.kind === 'reception') {
        // Timber welcome desk, backlit brand wall, and a small waiting lounge.
        const counter = new THREE.Mesh(
          new THREE.BoxGeometry(5.6, 1.08, 1.15),
          new THREE.MeshStandardMaterial({ color: isDark ? 0x24303a : 0x7a6047, roughness: 0.45, metalness: 0.08 })
        );
        counter.position.set(zone.x, 0.54, zone.z - 0.8);
        counter.castShadow = !isSoftwareGl;
        counter.receiveShadow = true;
        scene.add(counter);

        const counterTop = new THREE.Mesh(
          new THREE.BoxGeometry(5.78, 0.12, 1.28),
          new THREE.MeshStandardMaterial({ color: isDark ? 0x30373a : 0x3c4140, roughness: 0.24, metalness: 0.1 })
        );
        counterTop.position.set(zone.x, 1.12, zone.z - 0.8);
        counterTop.castShadow = !isSoftwareGl;
        scene.add(counterTop);

        const receptionToeKick = new THREE.Mesh(
          new THREE.BoxGeometry(5.35, 0.12, 0.08),
          new THREE.MeshStandardMaterial({ color: primaryColor, metalness: 0.4, roughness: 0.28, emissive: primaryColor, emissiveIntensity: 0.12 })
        );
        receptionToeKick.position.set(zone.x, 0.16, zone.z - 0.2);
        scene.add(receptionToeKick);

        const welcomeTexture = makeSignTexture(companyName, 'تقنية · محتوى · إبداع', primaryColor, true, maxAnisotropy);
        disposableTextures.push(welcomeTexture);
        const welcomeFrame = new THREE.Mesh(
          new THREE.BoxGeometry(8.4, 2.45, 0.16),
          new THREE.MeshStandardMaterial({ color: isDark ? 0x0c1722 : 0x1c2b36, roughness: 0.32, metalness: 0.58 })
        );
        welcomeFrame.position.set(zone.x, 2.88, zone.z + 2.8);
        scene.add(welcomeFrame);
        const welcomePanel = new THREE.Mesh(
          new THREE.PlaneGeometry(8.08, 2.14),
          new THREE.MeshStandardMaterial({ map: welcomeTexture, emissiveMap: welcomeTexture, emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 0.3, side: THREE.DoubleSide })
        );
        welcomePanel.position.set(zone.x, 2.88, zone.z + 2.71);
        welcomePanel.rotation.y = Math.PI;
        scene.add(welcomePanel);

        const loungeFabric = new THREE.MeshStandardMaterial({ color: isDark ? 0x43515b : 0x5e6668, roughness: 0.88 });
        const loungeLegs = new THREE.MeshStandardMaterial({ color: 0x29343a, metalness: 0.64, roughness: 0.32 });
        for (const x of [-4.1, 4.1]) {
          const sofaSeat = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.38, 0.88), loungeFabric);
          sofaSeat.position.set(x, 0.55, zone.z + 0.5);
          sofaSeat.castShadow = !isSoftwareGl;
          scene.add(sofaSeat);
          const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.82, 0.2), loungeFabric);
          sofaBack.position.set(x, 0.96, zone.z + 0.84);
          sofaBack.castShadow = !isSoftwareGl;
          scene.add(sofaBack);
          for (const armX of [-1.08, 1.08]) {
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.56, 0.84), loungeFabric);
            arm.position.set(x + armX, 0.72, zone.z + 0.5);
            scene.add(arm);
          }
          for (const legX of [-0.9, 0.9]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.26, 0.075), loungeLegs);
            leg.position.set(x + legX, 0.18, zone.z + 0.18);
            scene.add(leg);
          }
        }
        const coffeeTop = new THREE.Mesh(
          new THREE.CylinderGeometry(0.82, 0.82, 0.09, 24),
          new THREE.MeshStandardMaterial({ color: isDark ? 0x313a3d : 0x594b3c, roughness: 0.38, metalness: 0.1 })
        );
        coffeeTop.position.set(zone.x, 0.55, zone.z + 0.5);
        scene.add(coffeeTop);
        const coffeeStem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.52, 12), loungeLegs);
        coffeeStem.position.set(zone.x, 0.29, zone.z + 0.5);
        scene.add(coffeeStem);
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
      } else if (zone.kind === 'break_area' || zone.kind === 'approval_waiting') {
        const seatMaterial = new THREE.MeshStandardMaterial({
          color: zone.kind === 'break_area' ? (isDark ? 0x27635f : 0x3d7d73) : (isDark ? 0x68512c : 0x9a7437),
          roughness: 0.86,
        });
        const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x303b40, metalness: 0.45, roughness: 0.42 });
        for (const seat of zone.workstations) {
          const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.18, 0.82), seatMaterial);
          cushion.position.set(seat.x, 0.54, seat.z);
          cushion.rotation.y = seat.rotY;
          cushion.castShadow = !isSoftwareGl;
          scene.add(cushion);
          const back = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.7, 0.14), seatMaterial);
          back.position.set(seat.x, 0.93, seat.z + 0.32);
          back.rotation.y = seat.rotY;
          back.castShadow = !isSoftwareGl;
          scene.add(back);
          for (const legOffset of [-0.31, 0.31]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.08), frameMaterial);
            leg.position.set(seat.x + legOffset, 0.25, seat.z + legOffset);
            scene.add(leg);
          }
        }
        if (zone.kind === 'break_area') {
          const table = new THREE.Mesh(
            new THREE.CylinderGeometry(0.72, 0.72, 0.11, 24),
            new THREE.MeshStandardMaterial({ color: isDark ? 0x37414a : 0x77654e, roughness: 0.42 })
          );
          table.position.set(zone.x, 0.65, zone.z);
          table.receiveShadow = true;
          scene.add(table);
        }
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

    // Place three-dimensional staff and AI colleagues at their current work or meeting positions.
    for (const actor of actors) {
      if (humanoidAssets.length > 0) {
        const asset = humanoidAssets[stableActorHash(actor.id) % humanoidAssets.length];
        const atSeat = actor.operationalStatus === 'in_meeting' || actor.worldPosition.zoneId === 'zone_approval_waiting';
        const offsetZ = atSeat ? 0 : actor.worldPosition.rotY === 0 ? 0.35 : -0.35;
        const targetPosition = new THREE.Vector3(
          actor.worldPosition.x,
          0,
          actor.worldPosition.z + offsetZ
        );
        const targetRotationY = actor.worldPosition.rotY + (atSeat ? 0 : Math.PI);
        const previous = actorPositionsRef.current.get(actor.id);
        const startPosition = previous?.position.clone() ?? targetPosition.clone();
        const startRotationY = previous?.rotationY ?? targetRotationY;
        const distance = startPosition.distanceTo(targetPosition);
        const startsWalking = distance > 0.45 && !reducedMotion;
        const human = buildRiggedHumanGroup(actor, asset, !isSoftwareGl, startsWalking);
        human.root.position.copy(startPosition);
        human.root.rotation.y = startRotationY;
        human.model.rotation.y = 0;
        human.model.scale.setScalar(0.96 + (stableActorHash(`${actor.id}:height`) % 9) * 0.01);
        scene.add(human.root);
        interactables.push(human.root);
        animatedEmployees.push({
          ...human,
          startPosition,
          targetPosition,
          startRotationY,
          targetRotationY,
          transitionDuration: Math.max(0.65, Math.min(3, distance / 1.25)),
          transitionProgress: startsWalking ? 0 : 1,
          inTransition: startsWalking,
        });
        actorPositionsRef.current.set(actor.id, { position: targetPosition.clone(), rotationY: targetRotationY });
        continue;
      }
      const avatar = buildAvatarGroup(actor, !isSoftwareGl);
      const isSeatedInMeeting = actor.operationalStatus === 'in_meeting';
      const offsetZ = isSeatedInMeeting ? 0 : actor.worldPosition.rotY === 0 ? 0.35 : -0.35;
      avatar.position.set(actor.worldPosition.x, 0, actor.worldPosition.z + offsetZ);
      avatar.rotation.y = actor.worldPosition.rotY;
      scene.add(avatar);
      interactables.push(avatar);

      const isActiveActor = actor.actorType === 'agent'
        ? ['working', 'validating', 'waiting_for_approval', 'failed'].includes(actor.operationalStatus)
        : ['working', 'validating', 'in_meeting'].includes(actor.operationalStatus);
      if (isActiveActor) {
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
          if (sel.kind === 'human' || sel.kind === 'agent') {
            const focus = hits[0].object.getWorldPosition(new THREE.Vector3());
            focus.y = 0.95;
            const viewDirection = camera.position.clone().sub(controls.target).normalize();
            cameraGoalRef.current.target.copy(focus);
            cameraGoalRef.current.pos.copy(focus).addScaledVector(viewDirection, 8.5);
            cameraGoalRef.current.active = true;
            setActivePreset('focus');
            requestRenderRef.current();
          }
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

      // All employees use their rigged animations; low-cost status indicators remain visible above the team.
      if (!reducedMotion && animatedAvatars.length > 0) {
        for (let i = 0; i < animatedAvatars.length; i += 1) {
          const av = animatedAvatars[i];
          const status = av.userData.actorStatus as OperationalStatus;
          const beacon = av.getObjectByName('statusBeacon');
          if (beacon) {
            beacon.rotation.y = elapsed * 2.2;
          }
        }
        keepAnimating = true;
      }

      if (!reducedMotion && animatedEmployees.length > 0) {
        for (let i = 0; i < animatedEmployees.length; i += 1) {
          const person = animatedEmployees[i];
          person.mixer.update(dt);

          if (person.inTransition && person.walkAction) {
            person.transitionProgress = Math.min(1, person.transitionProgress + dt / person.transitionDuration);
            const t = THREE.MathUtils.smoothstep(person.transitionProgress, 0, 1);
            person.root.position.lerpVectors(person.startPosition, person.targetPosition, t);
            const turn = THREE.MathUtils.euclideanModulo(person.targetRotationY - person.startRotationY + Math.PI, Math.PI * 2) - Math.PI;
            person.root.rotation.y = person.startRotationY + turn * t;
            keepAnimating = true;

            if (person.transitionProgress >= 1) {
              person.inTransition = false;
              person.walkAction.fadeOut(0.22);
              person.desiredAction.reset().fadeIn(0.22).play();
              person.desiredAction.time = person.desiredAction.getClip().duration * person.animationPhase;
            }
          }

          const beacon = person.root.getObjectByName('statusBeacon');
          if (beacon) beacon.rotation.y = elapsed * 1.6;
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
  }, [companyName, primaryColor, theme, reducedMotion, zones, actors, meetingRooms, pendingApprovalsCount, selectedId, onWebglUnavailable, humanoidAssets]);

  if (webglFailed) {
    return (
      <div className="h-[520px] rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
        <Layers className="w-8 h-8 text-slate-400 mb-3" />
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          العرض ثلاثي الأبعاد غير متاح على هذا الجهاز
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-md">
          استخدم تبويب مخطط المقر للتنقل بين أقسام الشركة.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[560px] lg:h-[620px] rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-200 dark:bg-slate-950 select-none">
      <div ref={containerRef} className="w-full h-full" aria-label="مقر الشركة التفاعلي ثلاثي الأبعاد" />

      {/* Top-Left Minimal Context Chip (No backdrop-filter over WebGL!) */}
      <div className="absolute top-3 left-3 z-10 pointer-events-none flex items-center gap-2">
        <div className="bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 shadow-xs">
          {hoveredLabel ? `عرض: ${hoveredLabel}` : 'اسحب لتدوير المشهد · مرّر للتقريب · اختر موظفاً أو غرفة أو شاشة'}
        </div>
      </div>

      {contextLost && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/80 text-white text-sm">
          جارٍ استعادة عرض المقر...
        </div>
      )}

      {/* Collapsible Bottom Camera & Zone Control Dock (Zero side clutter) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 max-w-[94%]">
        <div className="bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm px-2.5 py-2 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
              <Compass className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span>زاوية العرض</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => triggerPreset(CAMERA_PRESETS[0])}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                title="إعادة ضبط زاوية العرض"
              >
                <RotateCcw className="w-3 h-3" />
                إعادة ضبط
              </button>
              <button
                type="button"
                onClick={() => setDockExpanded((v) => !v)}
                aria-label={dockExpanded ? 'طي أدوات العرض' : 'فتح أدوات العرض'}
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
