// Main Phaser scene. Renders the server state; predicts only the local player's movement
// (same deterministic step as the server) and reconciles against server acknowledgements.
// Remote entities are interpolated ~100 ms in the past for smooth motion.

import {
  CHARACTERS,
  DASH_COOLDOWN_MS,
  MERCHANT_RADIUS,
  NPCS,
  PICKUP_RADIUS,
  PLAYER_RADIUS,
  RESOURCES,
  generateArena,
  regionAt,
  startDash,
  stepMovement,
  type ArenaMap,
  type MoverState,
} from "@cryptoarena/game-core";
import { Buttons, RARITY_COLORS, type Rarity } from "@cryptoarena/shared";
import Phaser from "phaser";
import { useApp } from "../lib/store";
import { useHud, type MinimapDot } from "./hud";
import { KeyboardMouseInput, TouchInput, isTouchDevice, type InputSource } from "./input";
import type { ArenaLink } from "./net";
import { generateTextures } from "./textures";
import { heroTextureKey, generateHeroTextures } from "./art/characters";
import { CREATURE_BODY_RADIUS, creatureTextureKey, generateCreatureTextures } from "./art/creatures";
import { GROUND_RES, REGION_STYLE, RESOURCE_TEXTURE, generateGround, generateWorldTextures, treeTextureFor } from "./art/world";
import type { LootView, NpcView, PlayerView, ProjectileView, ResourceView } from "./types";

const INTERP_DELAY_MS = 100;
const DISPLAY_FONT = "Orbitron, Inter, system-ui, sans-serif";
const FIXED_DT = 1000 / 60;

interface Snapshot {
  t: number;
  x: number;
  y: number;
}

interface RemoteBody {
  container: Phaser.GameObjects.Container;
  /** The rotating character/creature sprite (faces +x at rotation 0). */
  body: Phaser.GameObjects.Image;
  aura: Phaser.GameObjects.Image;
  hpBar: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  snapshots: Snapshot[];
  aim: number;
  hp: number;
  maxHp: number;
  /** Trailing HP value that drains after damage (the "chip" bar). */
  hpTrail: number;
  hpColor: number;
  radius: number;
  baseScale: number;
  baseTint: number | null;
  rotates: boolean;
  lastX: number;
  lastY: number;
  walk: number;
  lastGhostAt: number;
}

/** Hero sprite torso radius on its 160 px canvas; the sprite is scaled so the torso matches PLAYER_RADIUS. */
const HERO_TORSO = 28;

interface PendingInput {
  seq: number;
  mx: number;
  my: number;
  aim: number;
  buttons: number;
  dash: boolean;
}

function colorOf(cls: string): number {
  return CHARACTERS.find((c) => c.key === cls)?.color ?? 0x22d3ee;
}

export class ArenaScene extends Phaser.Scene {
  private conn!: ArenaLink;
  private map!: ArenaMap;
  private input_!: InputSource;
  private touch: TouchInput | null = null;

  private readonly players = new Map<string, RemoteBody>();
  private readonly npcs = new Map<string, RemoteBody>();
  private readonly projectiles = new Map<string, { sprite: Phaser.GameObjects.Image; view: ProjectileView; born: number }>();
  private readonly loot = new Map<string, Phaser.GameObjects.Container>();
  private readonly resources = new Map<string, Phaser.GameObjects.Container>();
  private hq = true;
  private readonly npcKinds = new Map<string, string>();
  private readonly canopies: Phaser.GameObjects.Image[] = [];
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private embers!: Phaser.GameObjects.Particles.ParticleEmitter;
  private trails!: Phaser.GameObjects.Particles.ParticleEmitter;

  // Local prediction
  private seq = 0;
  private pending: PendingInput[] = [];
  private mover: MoverState = { x: 0, y: 0, dashRemainingMs: 0, dashDirX: 0, dashDirY: 0 };
  private errorX = 0;
  private errorY = 0;
  private localNextDash = 0;
  private accumulator = 0;
  private selfReady = false;
  private lastHudAt = 0;
  private lastMinimapAt = 0;

  constructor() {
    super({ key: "arena" });
  }

  init(data: { conn: ArenaLink; touch?: (t: TouchInput | null) => void }): void {
    this.conn = data.conn;
    this.registry.set("touchCb", data.touch);
  }

  create(): void {
    generateTextures(this);
    generateHeroTextures(this);
    generateCreatureTextures(this);
    generateWorldTextures(this);
    this.hq = useApp.getState().settings.highQuality;
    const state = this.conn.state;
    this.map = generateArena(state.mapSeed, state.worldSize);
    this.drawWorld();
    this.createEmitters();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.map.size, this.map.size);
    cam.setBackgroundColor("#03040a");
    if (this.hq && this.renderer.type === Phaser.WEBGL) {
      Phaser.Actions.AddEffectBloom(cam, { threshold: 0.62, blurRadius: 2.2, blurSteps: 4, blendAmount: 0.55 });
      cam.filters.external.addVignette(0.5, 0.5, 0.95, 0.42, 0x000010);
    }
    cam.setZoom(this.scale.width < 900 ? 0.75 : 1);
    this.scale.on("resize", (size: Phaser.Structs.Size) => cam.setZoom(size.width < 900 ? 0.75 : 1));

    if (isTouchDevice()) {
      this.touch = new TouchInput(this);
      this.input_ = this.touch;
    } else {
      this.input_ = new KeyboardMouseInput(this);
    }
    (this.registry.get("touchCb") as ((t: TouchInput | null) => void) | undefined)?.(this.touch);

    this.bindState();
    this.bindMessages();
    useHud.getState().set({ connected: true, worldSize: this.map.size, mapSeed: this.map.seed, mode: state.mode });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input_.destroy());
  }

  // ───────────────────────── World ─────────────────────────

  private drawWorld(): void {
    const size = this.map.size;
    const c = size / 2;
    const groundKey = generateGround(this, this.map);
    this.add.image(c, c, groundKey).setScale(size / GROUND_RES).setDepth(-10);
    this.add.tileSprite(c, c, size, size, "grid").setDepth(-9).setAlpha(0.35);
    const border = this.add.graphics().setDepth(-8);
    border.lineStyle(40, 0x22d3ee, 0.08).strokeRect(0, 0, size, size);
    border.lineStyle(6, 0x22d3ee, 0.8).strokeRect(0, 0, size, size);

    for (const z of this.map.zones) {
      if (z.kind === "safe") {
        const dome = this.add.image(z.x, z.y, "zone_safe").setScale((z.r * 2) / 500).setDepth(-7);
        this.tweens.add({ targets: dome, alpha: 0.7, yoyo: true, repeat: -1, duration: 1800, ease: "Sine.easeInOut" });
      } else if (z.kind === "healing") {
        const pool = this.add.image(z.x, z.y, "zone_heal").setScale((z.r * 2) / 248).setDepth(-7);
        this.tweens.add({ targets: pool, scale: pool.scale * 1.05, alpha: 0.75, yoyo: true, repeat: -1, duration: 1400, ease: "Sine.easeInOut" });
      } else {
        const rune = this.add.image(z.x, z.y, "zone_xp").setScale((z.r * 2) / 500).setDepth(-7).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: rune, angle: 360, repeat: -1, duration: 40_000 });
      }
    }
    for (const m of this.map.merchants) {
      this.add.image(m.x, m.y + 16, "shadow").setScale(1.6).setDepth(0);
      const stall = this.add.image(m.x, m.y, "merchant").setDepth(1);
      this.tweens.add({ targets: stall, y: m.y - 4, yoyo: true, repeat: -1, duration: 1600, ease: "Sine.easeInOut" });
      this.add
        .text(m.x, m.y - 72, "◆ MERCHANT  [B]", { fontFamily: DISPLAY_FONT, fontSize: "14px", color: "#7dd3fc", stroke: "#020617", strokeThickness: 5 })
        .setOrigin(0.5)
        .setDepth(1);
    }

    const walls = this.add.graphics().setDepth(3);
    this.map.obstacles.forEach((o, i) => {
      if (o.kind === "circle") {
        const region = regionAt(o.x, o.y, size);
        const key = treeTextureFor(region.key, o.r, i);
        const isTree = key.startsWith("tree");
        this.add
          .image(o.x + o.r * 0.25, o.y + o.r * 0.35, "shadow")
          .setScale((o.r * 2.6) / 128, (o.r * 2.2) / 64)
          .setDepth(1)
          .setAlpha(0.8);
        const img = this.add
          .image(o.x, o.y, key)
          .setScale((o.r * (isTree ? 2.5 : 2.15)) / 256)
          .setRotation((i * 2.399) % (Math.PI * 2))
          .setDepth(isTree ? 14 : 2);
        if (isTree) {
          // Canopies sway and sit above characters; they fade when someone walks under them.
          img.setAlpha(0.95);
          this.tweens.add({ targets: img, angle: img.angle + 3, yoyo: true, repeat: -1, duration: 2600 + (i % 7) * 300, ease: "Sine.easeInOut" });
          this.canopies.push(img);
        }
      } else {
        this.add
          .image(o.x + o.w / 2 + 10, o.y + o.h / 2 + 14, "shadow")
          .setScale((o.w * 1.3) / 128, (o.h * 1.6) / 64)
          .setDepth(1)
          .setAlpha(0.7);
        this.add.tileSprite(o.x + o.w / 2, o.y + o.h / 2, o.w, o.h, "wall_tile").setDepth(2);
        const accent = REGION_STYLE[regionAt(o.x + o.w / 2, o.y + o.h / 2, size).key]?.accent ?? 0xa855f7;
        walls.fillStyle(0xffffff, 0.08).fillRect(o.x, o.y, o.w, 4);
        walls.lineStyle(6, accent, 0.15).strokeRect(o.x - 2, o.y - 2, o.w + 4, o.h + 4);
        walls.lineStyle(2, accent, 0.8).strokeRect(o.x, o.y, o.w, o.h);
      }
    });

    // Screen-space ambient motes.
    if (this.hq) {
      this.add
        .particles(0, 0, "fx_spark", {
          x: { min: 0, max: this.scale.width },
          y: { min: 0, max: this.scale.height },
          lifespan: 6000,
          speedY: { min: -12, max: -30 },
          speedX: { min: -8, max: 8 },
          scale: { start: 0.25, end: 0 },
          alpha: { start: 0.5, end: 0 },
          tint: [0x22d3ee, 0xe879f9, 0xa3e635],
          frequency: 180,
          blendMode: Phaser.BlendModes.ADD,
        })
        .setScrollFactor(0)
        .setDepth(40);
    }
  }

  private createEmitters(): void {
    this.sparks = this.add
      .particles(0, 0, "fx_spark", {
        emitting: false,
        lifespan: { min: 300, max: 650 },
        speed: { min: 90, max: 380 },
        scale: { start: 0.55, end: 0 },
        alpha: { start: 1, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(30);
    this.embers = this.add
      .particles(0, 0, "fx_soft", {
        emitting: false,
        lifespan: { min: 500, max: 1100 },
        speed: { min: 20, max: 140 },
        scale: { start: 0.45, end: 0 },
        alpha: { start: 0.7, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(29);
    this.trails = this.add
      .particles(0, 0, "fx_soft", {
        emitting: false,
        lifespan: 260,
        scale: { start: 0.22, end: 0 },
        alpha: { start: 0.8, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(10);
  }

  // ───────────────────────── State binding ─────────────────────────

  private makeBody(x: number, y: number, radius: number, texture: string, scale: number, aura: number, name: string, labelColor: string): RemoteBody {
    const shadow = this.add.image(radius * 0.15, radius * 0.45, "shadow").setScale((radius * 2.6) / 128, (radius * 1.8) / 64).setAlpha(0.9);
    const glow = this.add
      .image(0, 0, "fx_soft")
      .setTint(aura)
      .setScale((radius * 3.4) / 128)
      .setAlpha(0.45)
      .setBlendMode(Phaser.BlendModes.ADD);
    const body = this.add.image(0, 0, texture).setScale(scale);
    const hpBar = this.add.graphics();
    const label = this.add
      .text(0, -radius - 30, name, { fontFamily: DISPLAY_FONT, fontSize: "12px", fontStyle: "bold", color: labelColor, stroke: "#020617", strokeThickness: 4 })
      .setOrigin(0.5);
    const container = this.add.container(x, y, [shadow, glow, body, hpBar, label]).setDepth(10);
    return {
      container,
      body,
      aura: glow,
      hpBar,
      label,
      snapshots: [{ t: performance.now(), x, y }],
      aim: 0,
      hp: 1,
      maxHp: 1,
      hpTrail: 1,
      hpColor: 0x4ade80,
      radius,
      baseScale: scale,
      baseTint: null,
      rotates: true,
      lastX: x,
      lastY: y,
      walk: 0,
      lastGhostAt: 0,
    };
  }

  private drawHp(b: RemoteBody): void {
    const w = Math.max(48, Math.min(160, b.radius * 2.4));
    const h = b.radius > 60 ? 9 : 6;
    const y = -b.radius - 16;
    const pct = b.maxHp > 0 ? Math.max(0, Math.min(1, b.hp / b.maxHp)) : 0;
    const trail = b.maxHp > 0 ? Math.max(pct, Math.min(1, b.hpTrail / b.maxHp)) : 0;
    const g = b.hpBar;
    g.clear();
    g.fillStyle(0x020617, 0.85).fillRoundedRect(-w / 2 - 2, y - 2, w + 4, h + 4, 3);
    g.fillStyle(0xffffff, 0.8).fillRect(-w / 2, y, w * trail, h);
    const color = pct > 0.5 ? b.hpColor : pct > 0.25 ? 0xfacc15 : 0xf43f5e;
    g.fillStyle(color, 1).fillRect(-w / 2, y, w * pct, h);
    g.fillStyle(0xffffff, 0.35).fillRect(-w / 2, y, w * pct, Math.max(1, h / 3));
    // segment ticks every 10 % of max HP
    g.fillStyle(0x020617, 0.6);
    for (let i = 1; i < 10; i++) g.fillRect(-w / 2 + (w * i) / 10, y, 1, h);
  }

  private bindState(): void {
    const cb = this.conn.callbacks();
    const me = this.conn.sessionId;

    cb.onAdd("players", (raw, id) => {
      const p = raw as PlayerView;
      const isMe = id === me;
      const classColor = colorOf(p.cls);
      const b = this.makeBody(
        p.x,
        p.y,
        PLAYER_RADIUS,
        heroTextureKey(p.cls),
        PLAYER_RADIUS / HERO_TORSO,
        p.tint || classColor,
        `${p.name}  ${p.level}`,
        isMe ? "#a5f3fc" : p.isBot ? "#cbd5e1" : "#fde68a",
      );
      // Skins recolor the hero; the default class color keeps the painted palette.
      if (p.tint && p.tint !== classColor) {
        b.baseTint = p.tint;
        b.body.setTint(p.tint);
      }
      b.hp = p.hp;
      b.maxHp = p.maxHp;
      b.hpTrail = p.hp;
      b.hpColor = isMe ? 0x22d3ee : p.isBot ? 0x4ade80 : 0xfbbf24;
      this.drawHp(b);
      this.players.set(id, b);
      if (isMe) {
        this.mover = { x: p.x, y: p.y, dashRemainingMs: 0, dashDirX: 0, dashDirY: 0 };
        this.cameras.main.startFollow(b.container, true, 0.2, 0.2);
        this.selfReady = true;
        b.container.setDepth(12);
        useHud.getState().set({ portrait: this.textures.getBase64(heroTextureKey(p.cls)) });
        const ring = this.add.image(0, 0, "fx_ring").setTint(0x22d3ee).setScale((PLAYER_RADIUS * 2.6) / 220).setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD);
        b.container.addAt(ring, 1);
        this.tweens.add({ targets: ring, alpha: 0.2, scale: ring.scale * 1.12, yoyo: true, repeat: -1, duration: 900, ease: "Sine.easeInOut" });
      }
      cb.onChange(p, () => {
        b.hp = p.hp;
        b.maxHp = p.maxHp;
        b.aim = p.aim;
        b.label.setText(`${p.name}  ${p.level}`);
        b.container.setVisible(p.alive);
        b.body.setAlpha(p.flags & 1 ? 0.35 : p.flags & 4 ? 0.6 : 1);
        this.drawHp(b);
        if (isMe) {
          this.reconcile(p);
        } else {
          this.pushSnapshot(b, p.x, p.y);
        }
      });
    });
    cb.onRemove("players", (_raw, id) => {
      this.players.get(id)?.container.destroy();
      this.players.delete(id);
    });

    cb.onAdd("npcs", (raw, id) => {
      const n = raw as NpcView;
      const def = NPCS.find((d) => d.key === n.kind);
      const radius = def?.radius ?? 24;
      const scale = radius / (CREATURE_BODY_RADIUS[n.kind] ?? 40);
      const b = this.makeBody(
        n.x,
        n.y,
        radius,
        creatureTextureKey(n.kind),
        scale,
        def?.color ?? 0x94a3b8,
        n.kind === "titan" ? `☠ ${def?.name ?? n.kind}` : `${def?.name ?? n.kind}  ${def?.level ?? ""}`,
        n.kind === "titan" ? "#fda4af" : "#e2e8f0",
      );
      if (n.kind === "chest") {
        b.rotates = false;
        this.tweens.add({ targets: b.aura, alpha: 0.9, yoyo: true, repeat: -1, duration: 900 });
      }
      if (n.kind === "titan") {
        b.label.setFontSize(16).setColor("#fecdd3");
        this.tweens.add({ targets: b.aura, scale: b.aura.scale * 1.25, alpha: 0.8, yoyo: true, repeat: -1, duration: 1200, ease: "Sine.easeInOut" });
      } else b.label.setFontSize(10);
      b.hp = n.hp;
      b.maxHp = n.maxHp;
      b.hpTrail = n.hp;
      b.hpColor = 0xf87171;
      this.drawHp(b);
      b.container.setDepth(8);
      this.npcs.set(id, b);
      this.npcKinds.set(id, n.kind);
      cb.onChange(n, () => {
        b.hp = n.hp;
        b.aim = n.aim;
        this.drawHp(b);
        this.pushSnapshot(b, n.x, n.y);
      });
    });
    cb.onRemove("npcs", (_raw, id) => {
      const b = this.npcs.get(id);
      if (b) {
        this.burst(b.container.x, b.container.y, NPCS.find((d) => d.key === this.npcKinds.get(id))?.color ?? 0xf87171, b.radius);
        b.container.destroy();
      }
      this.npcs.delete(id);
      this.npcKinds.delete(id);
    });

    cb.onAdd("projectiles", (raw, id) => {
      const v = raw as ProjectileView;
      const sprite = this.add
        .image(v.x, v.y, v.kind === "bolt" ? "proj_bolt" : "proj_arrow")
        .setRotation(Math.atan2(v.vy, v.vx))
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(11);
      if (v.kind === "bolt") this.tweens.add({ targets: sprite, scale: 1.25, yoyo: true, repeat: -1, duration: 120 });
      this.projectiles.set(id, { sprite, view: v, born: performance.now() });
    });
    cb.onRemove("projectiles", (_raw, id) => {
      const p = this.projectiles.get(id);
      if (p) this.sparks.setParticleTint(p.view.kind === "bolt" ? 0xe879f9 : 0x7dd3fc).explode(this.hq ? 8 : 3, p.sprite.x, p.sprite.y);
      p?.sprite.destroy();
      this.projectiles.delete(id);
    });

    cb.onAdd("loot", (raw, id) => {
      const l = raw as LootView;
      const color = Phaser.Display.Color.HexStringToColor(RARITY_COLORS[l.rarity as Rarity] ?? "#ffffff").color;
      const rank = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"].indexOf(l.rarity);
      const glow = this.add.image(0, 0, "fx_soft").setTint(color).setScale(0.6 + rank * 0.08).setAlpha(0.8).setBlendMode(Phaser.BlendModes.ADD);
      const beam = this.add
        .image(0, 4, "loot_beam")
        .setOrigin(0.5, 1)
        .setTint(color)
        .setScale(1, 0.4 + Math.max(0, rank) * 0.18)
        .setAlpha(0.55)
        .setBlendMode(Phaser.BlendModes.ADD);
      const gem = this.add.image(0, 0, "loot_gem").setTint(color).setScale(0.55);
      const text = this.add
        .text(0, -30, l.name, { fontFamily: DISPLAY_FONT, fontSize: "10px", color: RARITY_COLORS[l.rarity as Rarity] ?? "#fff", stroke: "#020617", strokeThickness: 4 })
        .setOrigin(0.5);
      const c = this.add.container(l.x, l.y, [glow, beam, gem, text]).setDepth(5);
      this.tweens.add({ targets: gem, y: -7, angle: 10, yoyo: true, repeat: -1, duration: 750, ease: "Sine.easeInOut" });
      this.tweens.add({ targets: beam, alpha: 0.25, yoyo: true, repeat: -1, duration: 900 });
      this.sparks.setParticleTint(color).explode(10, l.x, l.y);
      this.loot.set(id, c);
    });
    cb.onRemove("loot", (_raw, id) => {
      this.loot.get(id)?.destroy();
      this.loot.delete(id);
    });

    cb.onAdd("resources", (raw, id) => {
      const r = raw as ResourceView;
      const def = RESOURCES.find((d) => d.key === r.kind);
      const color = def?.color ?? 0xffffff;
      const shadow = this.add.image(4, 18, "shadow").setScale(0.45, 0.35);
      const glow = this.add.image(0, 0, "fx_soft").setTint(color).setScale(0.55).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD);
      const img = this.add.image(0, 0, RESOURCE_TEXTURE[r.kind] ?? "res_crystal").setScale(def?.questObject ? 0.75 : 0.55);
      const c = this.add.container(r.x, r.y, [shadow, glow, img]).setDepth(4);
      this.tweens.add({ targets: img, y: -5, yoyo: true, repeat: -1, duration: 1100 + (r.x % 400), ease: "Sine.easeInOut" });
      this.tweens.add({ targets: glow, alpha: 0.25, yoyo: true, repeat: -1, duration: 1300 });
      this.resources.set(id, c);
    });
    cb.onRemove("resources", (_raw, id) => {
      const img = this.resources.get(id);
      if (img) this.burst(img.x, img.y, 0x22d3ee, 18);
      img?.destroy();
      this.resources.delete(id);
    });

    cb.listen("phase", (v) => useHud.getState().set({ phase: String(v) }));
    cb.listen("phaseEndsAt", (v) => useHud.getState().set({ phaseEndsAt: Number(v) }));
  }

  private pushSnapshot(b: RemoteBody, x: number, y: number): void {
    b.snapshots.push({ t: performance.now(), x, y });
    if (b.snapshots.length > 6) b.snapshots.shift();
  }

  private interpolate(b: RemoteBody, renderT: number): void {
    const s = b.snapshots;
    const last = s[s.length - 1]!;
    let x = last.x;
    let y = last.y;
    for (let i = s.length - 1; i > 0; i--) {
      const a = s[i - 1]!;
      const c = s[i]!;
      if (renderT >= a.t && renderT <= c.t) {
        const t = c.t === a.t ? 1 : (renderT - a.t) / (c.t - a.t);
        x = a.x + (c.x - a.x) * t;
        y = a.y + (c.y - a.y) * t;
        break;
      }
      if (i === 1 && renderT < a.t) {
        x = a.x;
        y = a.y;
      }
    }
    b.container.setPosition(x, y);
  }

  /** Per-frame cosmetic animation: facing, walk bob, hp chip bar, dash afterimages. */
  private animate(b: RemoteBody, delta: number, dashing: boolean): void {
    const x = b.container.x;
    const y = b.container.y;
    const moved = Math.hypot(x - b.lastX, y - b.lastY);
    b.lastX = x;
    b.lastY = y;
    if (b.rotates) b.body.setRotation(b.aim);
    b.walk += moved * 0.09;
    const bob = moved > 0.3 ? Math.sin(b.walk) * 0.045 : Math.sin(this.time.now / 500) * 0.015;
    b.body.setScale(b.baseScale * (1 + bob), b.baseScale * (1 - bob));
    if (b.hpTrail > b.hp) {
      b.hpTrail = Math.max(b.hp, b.hpTrail - Math.max(1, b.maxHp * 0.6 * (delta / 1000)));
      this.drawHp(b);
    } else if (b.hpTrail < b.hp) b.hpTrail = b.hp;
    if (dashing && this.time.now - b.lastGhostAt > 30 && b.container.visible) {
      b.lastGhostAt = this.time.now;
      const ghost = this.add
        .image(x, y, b.body.texture.key)
        .setRotation(b.body.rotation)
        .setScale(b.baseScale)
        .setTint(0x67e8f9)
        .setTintMode(Phaser.TintModes.FILL)
        .setAlpha(0.45)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(9);
      this.tweens.add({ targets: ghost, alpha: 0, scale: b.baseScale * 0.9, duration: 260, onComplete: () => ghost.destroy() });
    }
  }

  // ───────────────────────── Prediction ─────────────────────────

  private selfSpeed(): number {
    return useHud.getState().self?.stats.speed ?? 300;
  }

  private reconcile(p: PlayerView): void {
    const oldX = this.mover.x;
    const oldY = this.mover.y;
    this.pending = this.pending.filter((i) => i.seq > p.ack);
    this.mover.x = p.x;
    this.mover.y = p.y;
    if (!(p.flags & 8)) this.mover.dashRemainingMs = 0;
    if (!p.alive) {
      this.pending = [];
      this.errorX = 0;
      this.errorY = 0;
      return;
    }
    const speed = this.selfSpeed();
    for (const input of this.pending) {
      if (input.dash) startDash(this.mover, input.mx, input.my, input.aim);
      stepMovement(this.mover, input.mx, input.my, speed, FIXED_DT, this.map, PLAYER_RADIUS);
    }
    const dx = oldX - this.mover.x;
    const dy = oldY - this.mover.y;
    // Large corrections (respawn/teleport) snap; small ones are smoothed away visually.
    if (Math.hypot(dx, dy) > 250) {
      this.errorX = 0;
      this.errorY = 0;
    } else {
      this.errorX += dx;
      this.errorY += dy;
    }
  }

  private fixedStep(): void {
    const me = this.players.get(this.conn.sessionId);
    const view = this.conn.state.players.get(this.conn.sessionId);
    if (!me || !view) return;
    const cam = this.cameras.main;
    const screenX = (me.container.x - cam.worldView.x) * cam.zoom;
    const screenY = (me.container.y - cam.worldView.y) * cam.zoom;
    const frame = this.input_.read(screenX, screenY);
    if (!view.alive) return;

    this.seq++;
    const now = performance.now();
    let dash = false;
    if (frame.buttons & Buttons.DASH && now >= this.localNextDash) {
      dash = true;
      this.localNextDash = now + DASH_COOLDOWN_MS;
      startDash(this.mover, frame.mx, frame.my, frame.aim);
    }
    this.conn.send("player_move", { seq: this.seq, mx: frame.mx, my: frame.my, aim: frame.aim, buttons: frame.buttons });
    this.pending.push({ seq: this.seq, ...frame, dash });
    if (this.pending.length > 120) this.pending.shift();
    stepMovement(this.mover, frame.mx, frame.my, this.selfSpeed(), FIXED_DT, this.map, PLAYER_RADIUS);
    me.aim = frame.aim;
  }

  // ───────────────────────── Messages ─────────────────────────

  private bindMessages(): void {
    const hud = useHud.getState();
    const settings = useApp.getState().settings;
    const me = this.conn.sessionId;

    this.conn.on("self_stats", (m) => useHud.getState().set({ self: m }));
    this.conn.on("player_attack", (m) => {
      const b = this.players.get(m.id);
      if (!b) return;
      if (m.kind === "melee") this.slash(b.container.x, b.container.y, m.aim, m.range, 0xffffff);
      else if (m.kind === "skill" || m.kind === "ultimate") this.shockwave(b.container.x, b.container.y, Math.max(120, m.range), m.kind === "ultimate" ? 0xe879f9 : 0x22d3ee);
    });
    this.conn.on("player_damage", (m) => {
      const target = this.players.get(m.targetId) ?? this.npcs.get(m.targetId);
      if (!target) return;
      if (settings.showDamageNumbers) this.floatText(target.container.x, target.container.y - 30, `${m.crit ? "✦" : ""}${m.amount}`, m.crit ? "#fbbf24" : m.sourceId === me ? "#ffffff" : "#f87171", m.crit ? 22 : 16);
      // Hit flash (Phaser 4 tint modes replace v3's setTintFill).
      target.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      this.time.delayedCall(70, () => {
        // `active` is false for children of a Container; a destroyed object has no scene.
        if (!target.body.scene) return;
        target.body.setTintMode(Phaser.TintModes.MULTIPLY);
        if (target.baseTint === null) target.body.clearTint();
        else target.body.setTint(target.baseTint);
      });
      this.sparks.setParticleTint(m.crit ? 0xfbbf24 : 0xffffff).explode(m.crit ? 14 : this.hq ? 7 : 3, target.container.x, target.container.y);
      if (m.targetId === me && settings.screenShake) this.cameras.main.shake(90, 0.004);
    });
    this.conn.on("player_death", (m) => {
      hud.pushKill(m);
      if (m.victimId === me) useHud.getState().set({ respawnAt: m.respawnAt, killedBy: m.killerName });
      const b = this.players.get(m.victimId);
      if (b) this.burst(b.container.x, b.container.y, 0xf43f5e, 50);
    });
    this.conn.on("player_respawn", (m) => {
      if (m.id === me) {
        this.mover = { x: m.x, y: m.y, dashRemainingMs: 0, dashDirX: 0, dashDirY: 0 };
        this.pending = [];
      }
    });
    this.conn.on("player_level_up", (m) => {
      const b = this.players.get(m.id);
      if (b) this.levelUp(b.container.x, b.container.y);
      if (m.id === me) useHud.getState().pushNotice(`LEVEL UP! → ${m.level}`, "#facc15");
    });
    this.conn.on("item_pickup", (m) => {
      const color = RARITY_COLORS[m.rarity] ?? "#fff";
      useHud.getState().pushNotice(m.gold ? `+${m.name} (+${m.gold} gold)` : `Picked up ${m.name}`, color);
    });
    this.conn.on("quest_complete", (m) => {
      useHud.getState().pushNotice(`Quest complete: ${m.name}`, "#a3e635");
      useApp.getState().toast("success", `Quest complete: ${m.name} — claim it in Quests`);
    });
    this.conn.on("reward_granted", (m) => {
      const d = useApp.getState().me?.balances.cryptoDecimals ?? 6;
      const sym = useApp.getState().me?.balances.cryptoSymbol ?? "ARENA";
      const amount = Number(BigInt(m.amount)) / 10 ** d;
      useHud.getState().pushNotice(`+${amount.toFixed(3)} ${sym} (${m.source.toLowerCase()})`, "#e879f9");
    });
    this.conn.on("notice", (m) => useHud.getState().pushNotice(m.message, m.level === "error" ? "#f87171" : m.level === "warn" ? "#fbbf24" : "#7dd3fc"));
    this.conn.on("match_start", () => useHud.getState().pushNotice("MATCH STARTED — FIGHT!", "#f43f5e"));
    this.conn.on("match_end", (m) => useHud.getState().set({ standings: m.standings }));
    this.conn.on("item_drop", () => undefined);
    this.conn.on("player_join", () => undefined);
    this.conn.on("player_leave", () => undefined);
  }

  // ───────────────────────── Effects ─────────────────────────

  private floatText(x: number, y: number, text: string, color: string, size: number): void {
    const t = this.add.text(x + Phaser.Math.Between(-12, 12), y, text, { fontFamily: DISPLAY_FONT, fontSize: `${size}px`, color, stroke: "#000", strokeThickness: 4 }).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 800, ease: "Cubic.easeOut", onComplete: () => t.destroy() });
  }

  private slash(x: number, y: number, aim: number, range: number, color: number): void {
    const arc = this.add
      .image(x, y, "fx_slash")
      .setRotation(aim - 0.5)
      .setScale((range * 2) / 220)
      .setTint(color)
      .setAlpha(0.95)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(20);
    this.tweens.add({ targets: arc, rotation: aim + 0.5, alpha: 0, scale: arc.scale * 1.12, duration: 200, ease: "Cubic.easeOut", onComplete: () => arc.destroy() });
  }

  private shockwave(x: number, y: number, radius: number, color: number): void {
    const ring = this.add.image(x, y, "fx_ring").setTint(color).setDepth(19).setScale(0.1).setAlpha(1).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: ring, scale: (radius * 2) / 220, alpha: 0, duration: 420, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
    const flash = this.add.image(x, y, "fx_soft").setTint(color).setDepth(18).setScale((radius * 2) / 128).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: flash, alpha: 0, duration: 300, onComplete: () => flash.destroy() });
    this.embers.setParticleTint(color).explode(this.hq ? 18 : 6, x, y);
  }

  private burst(x: number, y: number, color: number, size = 30): void {
    this.sparks.setParticleTint(color).explode(this.hq ? 26 : 8, x, y);
    this.embers.setParticleTint(color).explode(this.hq ? 14 : 4, x, y);
    const ring = this.add.image(x, y, "fx_ring").setTint(color).setDepth(19).setScale(0.1).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: ring, scale: (size * 4) / 220, alpha: 0, duration: 380, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
  }

  private levelUp(x: number, y: number): void {
    const pillar = this.add.image(x, y, "fx_pillar").setOrigin(0.5, 0.95).setTint(0xfacc15).setScale(1.4, 0.2).setAlpha(0.9).setBlendMode(Phaser.BlendModes.ADD).setDepth(25);
    this.tweens.add({ targets: pillar, scaleY: 1.6, alpha: 0, duration: 900, ease: "Cubic.easeOut", onComplete: () => pillar.destroy() });
    this.shockwave(x, y, 160, 0xfacc15);
    this.embers.setParticleTint(0xfde047).explode(this.hq ? 30 : 10, x, y);
  }

  // ───────────────────────── Frame ─────────────────────────

  override update(_time: number, delta: number): void {
    if (!this.selfReady) return;
    this.accumulator += Math.min(delta, 250);
    while (this.accumulator >= FIXED_DT) {
      this.accumulator -= FIXED_DT;
      this.fixedStep();
    }

    const now = performance.now();
    const renderT = now - INTERP_DELAY_MS;
    const meId = this.conn.sessionId;
    const state = this.conn.state;
    for (const [id, b] of this.players) {
      if (id === meId) continue;
      this.interpolate(b, renderT);
      this.animate(b, delta, ((state.players.get(id)?.flags ?? 0) & 8) !== 0);
    }
    for (const b of this.npcs.values()) {
      this.interpolate(b, renderT);
      this.animate(b, delta, false);
    }

    const me = this.players.get(meId);
    if (me) {
      this.errorX *= 0.85;
      this.errorY *= 0.85;
      me.container.setPosition(this.mover.x + this.errorX, this.mover.y + this.errorY);
      this.animate(me, delta, this.mover.dashRemainingMs > 0);
      // Canopies near the local player turn translucent so they never hide the fight.
      for (const c of this.canopies) {
        const r = c.displayWidth * 0.5;
        const inside = (c.x - me.container.x) ** 2 + (c.y - me.container.y) ** 2 < r * r;
        c.setAlpha(Phaser.Math.Linear(c.alpha, inside ? 0.3 : 0.95, 0.15));
      }
    }

    for (const p of this.projectiles.values()) {
      const t = (now - p.born) / 1000;
      p.sprite.setPosition(p.view.x + p.view.vx * t, p.view.y + p.view.vy * t);
      if (this.hq) this.trails.setParticleTint(p.view.kind === "bolt" ? 0xe879f9 : 0x38bdf8).emitParticleAt(p.sprite.x, p.sprite.y, 1);
    }

    // Discrete actions
    if (this.input_.consumeAction("pickup")) this.conn.send("pickup", {});
    if (this.input_.consumeAction("potion")) this.conn.send("use_item", {});
    if (this.input_.consumeAction("buy")) this.conn.send("buy_item", { sku: "potion_pack_5" });

    if (now - this.lastHudAt > 100) {
      this.lastHudAt = now;
      this.updateHud();
    }
  }

  private updateHud(): void {
    const state = this.conn.state;
    const meId = this.conn.sessionId;
    const self = state.players.get(meId);
    if (!self) return;
    const x = this.mover.x;
    const y = this.mover.y;
    const nearMerchant = this.map.merchants.some((m) => (m.x - x) ** 2 + (m.y - y) ** 2 <= MERCHANT_RADIUS ** 2);
    let nearLoot = false;
    for (const l of this.loot.values()) if ((l.x - x) ** 2 + (l.y - y) ** 2 <= (PICKUP_RADIUS + PLAYER_RADIUS) ** 2) nearLoot = true;

    const region = regionAt(x, y, this.map.size);
    const scoreboard: ReturnType<typeof useHud.getState>["scoreboard"] = [];
    state.players.forEach((p, id) => scoreboard.push({ id, name: p.name, kills: p.kills, deaths: p.deaths, score: p.score, level: p.level, isBot: p.isBot }));
    scoreboard.sort((a, b) => b.score - a.score);

    const patch: Partial<ReturnType<typeof useHud.getState>> = {
      hp: self.hp,
      maxHp: self.maxHp,
      level: self.level,
      alive: self.alive,
      kills: self.kills,
      deaths: self.deaths,
      score: self.score,
      serverNow: this.conn.serverNow(),
      ping: Math.round(this.conn.rtt),
      fps: Math.round(this.game.loop.actualFps),
      nearMerchant,
      region: region.name,
      regionKey: region.key,
      nearLoot,
      selfName: self.name,
      selfClass: self.cls,
      selfColor: self.tint || colorOf(self.cls),
      scoreboard,
    };
    const now = performance.now();
    if (now - this.lastMinimapAt > 500) {
      this.lastMinimapAt = now;
      const dots: MinimapDot[] = [{ x, y, kind: "self" }];
      state.players.forEach((p, id) => {
        if (id !== meId && p.alive) dots.push({ x: p.x, y: p.y, kind: "player" });
      });
      state.npcs.forEach((n) => dots.push({ x: n.x, y: n.y, kind: n.kind === "titan" ? "boss" : "npc" }));
      patch.minimap = dots;
    }
    useHud.getState().set(patch);
  }
}
