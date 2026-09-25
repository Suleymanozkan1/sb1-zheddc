// Main Phaser scene. Renders the server state; predicts only the local player's movement
// (same deterministic step as the server) and reconciles against server acknowledgements.
// Remote entities are interpolated ~100 ms in the past for smooth motion.

import { Callbacks } from "@colyseus/sdk";
import {
  CHARACTERS,
  DASH_COOLDOWN_MS,
  MERCHANT_RADIUS,
  NPCS,
  PICKUP_RADIUS,
  PLAYER_RADIUS,
  REGIONS,
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
import type { GameConnection } from "./net";
import { generateTextures } from "./textures";
import type { LootView, NpcView, PlayerView, ProjectileView, ResourceView } from "./types";

const INTERP_DELAY_MS = 100;
const FIXED_DT = 1000 / 60;

interface Snapshot {
  t: number;
  x: number;
  y: number;
}

interface RemoteBody {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  pointer: Phaser.GameObjects.Image;
  hpBar: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  snapshots: Snapshot[];
  aim: number;
  hp: number;
  maxHp: number;
  radius: number;
  baseTint: number;
}

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
  private conn!: GameConnection;
  private map!: ArenaMap;
  private input_!: InputSource;
  private touch: TouchInput | null = null;

  private readonly players = new Map<string, RemoteBody>();
  private readonly npcs = new Map<string, RemoteBody>();
  private readonly projectiles = new Map<string, { sprite: Phaser.GameObjects.Image; view: ProjectileView; born: number }>();
  private readonly loot = new Map<string, Phaser.GameObjects.Container>();
  private readonly resources = new Map<string, Phaser.GameObjects.Image>();

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

  init(data: { conn: GameConnection; touch?: (t: TouchInput | null) => void }): void {
    this.conn = data.conn;
    this.registry.set("touchCb", data.touch);
  }

  create(): void {
    generateTextures(this);
    const state = this.conn.state;
    this.map = generateArena(state.mapSeed, state.worldSize);
    this.drawWorld();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.map.size, this.map.size);
    cam.setBackgroundColor("#05060f");
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
    const ground = this.add.graphics().setDepth(-10);
    for (const r of [...REGIONS].reverse()) {
      ground.fillStyle(r.color, 1).fillCircle(c, c, Math.min(r.maxR, size * 0.72));
    }
    this.add.tileSprite(c, c, size, size, "grid").setDepth(-9);
    ground.lineStyle(6, 0x22d3ee, 0.5).strokeRect(0, 0, size, size);

    const zones = this.add.graphics().setDepth(-8);
    for (const z of this.map.zones) {
      const color = z.kind === "safe" ? 0x38bdf8 : z.kind === "healing" ? 0x4ade80 : 0xfacc15;
      zones.fillStyle(color, 0.07).fillCircle(z.x, z.y, z.r);
      zones.lineStyle(2, color, 0.35).strokeCircle(z.x, z.y, z.r);
    }
    for (const m of this.map.merchants) {
      this.add.image(m.x, m.y, "chest").setTint(0x38bdf8).setDepth(1);
      this.add.text(m.x, m.y - 44, "MERCHANT  [B]", { fontFamily: "Orbitron", fontSize: "14px", color: "#7dd3fc" }).setOrigin(0.5).setDepth(1);
    }

    const obstacles = this.add.graphics().setDepth(2);
    for (const o of this.map.obstacles) {
      if (o.kind === "circle") {
        obstacles.fillStyle(0x1f2a44, 1).fillCircle(o.x, o.y, o.r);
        obstacles.lineStyle(2, 0x3b82f6, 0.35).strokeCircle(o.x, o.y, o.r);
      } else {
        obstacles.fillStyle(0x1e1b3a, 1).fillRect(o.x, o.y, o.w, o.h);
        obstacles.lineStyle(2, 0xa855f7, 0.4).strokeRect(o.x, o.y, o.w, o.h);
      }
    }
  }

  // ───────────────────────── State binding ─────────────────────────

  private makeBody(x: number, y: number, radius: number, color: number, name: string, labelColor: string): RemoteBody {
    const glow = this.add.image(0, 0, "glow").setTint(color).setScale((radius * 3) / 64).setAlpha(0.5);
    const body = this.add.image(0, 0, "disc").setTint(color).setScale((radius * 2) / 64);
    const pointer = this.add.image(0, 0, "pointer").setTint(0xffffff).setAlpha(0.85).setScale(radius / 40);
    const hpBar = this.add.graphics();
    const label = this.add.text(0, -radius - 26, name, { fontFamily: "Inter", fontSize: "13px", color: labelColor, stroke: "#000", strokeThickness: 3 }).setOrigin(0.5);
    const container = this.add.container(x, y, [glow, body, pointer, hpBar, label]).setDepth(10);
    return { container, body, pointer, hpBar, label, snapshots: [{ t: performance.now(), x, y }], aim: 0, hp: 1, maxHp: 1, radius, baseTint: color };
  }

  private drawHp(b: RemoteBody, color = 0x4ade80): void {
    const w = Math.max(40, b.radius * 2);
    b.hpBar.clear();
    b.hpBar.fillStyle(0x000000, 0.6).fillRect(-w / 2, -b.radius - 12, w, 6);
    const pct = b.maxHp > 0 ? Math.max(0, Math.min(1, b.hp / b.maxHp)) : 0;
    b.hpBar.fillStyle(pct > 0.5 ? color : pct > 0.25 ? 0xfacc15 : 0xf43f5e, 1).fillRect(-w / 2, -b.radius - 12, w * pct, 6);
  }

  private bindState(): void {
    const room = this.conn.room;
    const cb = Callbacks.get(room as unknown as Parameters<typeof Callbacks.get>[0]) as unknown as {
      onAdd: (prop: string, h: (v: unknown, k: string) => void) => void;
      onRemove: (prop: string, h: (v: unknown, k: string) => void) => void;
      onChange: (inst: unknown, h: () => void) => void;
      listen: (prop: string, h: (v: unknown) => void) => void;
    };
    const me = this.conn.sessionId;

    cb.onAdd("players", (raw, id) => {
      const p = raw as PlayerView;
      const isMe = id === me;
      const b = this.makeBody(p.x, p.y, PLAYER_RADIUS, p.tint || colorOf(p.cls), `${p.name}  Lv${p.level}`, isMe ? "#a5f3fc" : p.isBot ? "#94a3b8" : "#fde68a");
      b.hp = p.hp;
      b.maxHp = p.maxHp;
      this.drawHp(b, isMe ? 0x22d3ee : 0x4ade80);
      this.players.set(id, b);
      if (isMe) {
        this.mover = { x: p.x, y: p.y, dashRemainingMs: 0, dashDirX: 0, dashDirY: 0 };
        this.cameras.main.startFollow(b.container, true, 0.2, 0.2);
        this.selfReady = true;
        b.container.setDepth(12);
      }
      cb.onChange(p, () => {
        b.hp = p.hp;
        b.maxHp = p.maxHp;
        b.aim = p.aim;
        b.label.setText(`${p.name}  Lv${p.level}`);
        b.container.setVisible(p.alive);
        b.body.setAlpha(p.flags & 1 ? 0.35 : p.flags & 4 ? 0.6 : 1);
        this.drawHp(b, isMe ? 0x22d3ee : 0x4ade80);
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
      const b = this.makeBody(n.x, n.y, radius, def?.color ?? 0x94a3b8, def?.name ?? n.kind, n.kind === "titan" ? "#fda4af" : "#cbd5e1");
      if (n.kind === "chest") {
        b.body.setTexture("chest").setScale(1.2).setTint(0xffffff);
        b.baseTint = 0xffffff;
        b.pointer.setVisible(false);
      }
      if (n.kind !== "titan") b.label.setFontSize(11);
      b.hp = n.hp;
      b.maxHp = n.maxHp;
      this.drawHp(b, 0xf87171);
      b.container.setDepth(8);
      this.npcs.set(id, b);
      cb.onChange(n, () => {
        b.hp = n.hp;
        b.aim = n.aim;
        this.drawHp(b, 0xf87171);
        this.pushSnapshot(b, n.x, n.y);
      });
    });
    cb.onRemove("npcs", (_raw, id) => {
      const b = this.npcs.get(id);
      if (b) {
        this.burst(b.container.x, b.container.y, 0xf87171);
        b.container.destroy();
      }
      this.npcs.delete(id);
    });

    cb.onAdd("projectiles", (raw, id) => {
      const v = raw as ProjectileView;
      const sprite = this.add
        .image(v.x, v.y, v.kind === "bolt" ? "bolt" : "arrow")
        .setTint(v.kind === "bolt" ? 0xe879f9 : 0x7dd3fc)
        .setRotation(Math.atan2(v.vy, v.vx))
        .setDepth(11);
      this.projectiles.set(id, { sprite, view: v, born: performance.now() });
    });
    cb.onRemove("projectiles", (_raw, id) => {
      this.projectiles.get(id)?.sprite.destroy();
      this.projectiles.delete(id);
    });

    cb.onAdd("loot", (raw, id) => {
      const l = raw as LootView;
      const color = Phaser.Display.Color.HexStringToColor(RARITY_COLORS[l.rarity as Rarity] ?? "#ffffff").color;
      const glow = this.add.image(0, 0, "glow").setTint(color).setScale(1.1).setAlpha(0.8);
      const gem = this.add.image(0, 0, "gem").setTint(color);
      const text = this.add.text(0, -26, l.name, { fontFamily: "Inter", fontSize: "11px", color: RARITY_COLORS[l.rarity as Rarity] ?? "#fff", stroke: "#000", strokeThickness: 3 }).setOrigin(0.5);
      const c = this.add.container(l.x, l.y, [glow, gem, text]).setDepth(5);
      this.tweens.add({ targets: gem, y: -6, yoyo: true, repeat: -1, duration: 700, ease: "Sine.easeInOut" });
      this.loot.set(id, c);
    });
    cb.onRemove("loot", (_raw, id) => {
      this.loot.get(id)?.destroy();
      this.loot.delete(id);
    });

    cb.onAdd("resources", (raw, id) => {
      const r = raw as ResourceView;
      const def = RESOURCES.find((d) => d.key === r.kind);
      const img = this.add.image(r.x, r.y, "crystal").setTint(def?.color ?? 0xffffff).setDepth(4);
      if (def?.questObject) img.setScale(1.4);
      this.resources.set(id, img);
    });
    cb.onRemove("resources", (_raw, id) => {
      const img = this.resources.get(id);
      if (img) this.burst(img.x, img.y, 0x22d3ee);
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
    b.pointer.setPosition(Math.cos(b.aim) * (b.radius + 6), Math.sin(b.aim) * (b.radius + 6)).setRotation(b.aim);
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
        if (target.body.scene) target.body.setTintMode(Phaser.TintModes.MULTIPLY).setTint(target.baseTint);
      });
      if (m.targetId === me && settings.screenShake) this.cameras.main.shake(90, 0.004);
    });
    this.conn.on("player_death", (m) => {
      hud.pushKill(m);
      if (m.victimId === me) useHud.getState().set({ respawnAt: m.respawnAt });
      const b = this.players.get(m.victimId);
      if (b) this.burst(b.container.x, b.container.y, 0xf43f5e);
    });
    this.conn.on("player_respawn", (m) => {
      if (m.id === me) {
        this.mover = { x: m.x, y: m.y, dashRemainingMs: 0, dashDirX: 0, dashDirY: 0 };
        this.pending = [];
      }
    });
    this.conn.on("player_level_up", (m) => {
      const b = this.players.get(m.id);
      if (b) this.shockwave(b.container.x, b.container.y, 140, 0xfacc15);
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
    const t = this.add.text(x + Phaser.Math.Between(-12, 12), y, text, { fontFamily: "Orbitron", fontSize: `${size}px`, color, stroke: "#000", strokeThickness: 4 }).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 800, ease: "Cubic.easeOut", onComplete: () => t.destroy() });
  }

  private slash(x: number, y: number, aim: number, range: number, color: number): void {
    const g = this.add.graphics().setDepth(20);
    g.lineStyle(6, color, 0.9);
    g.beginPath();
    g.arc(x, y, range * 0.9, aim - 0.9, aim + 0.9, false);
    g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() });
  }

  private shockwave(x: number, y: number, radius: number, color: number): void {
    const ring = this.add.image(x, y, "ring").setTint(color).setDepth(19).setScale(0.2).setAlpha(0.9);
    this.tweens.add({ targets: ring, scale: (radius * 2) / 64, alpha: 0, duration: 380, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
  }

  private burst(x: number, y: number, color: number): void {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const dot = this.add.image(x, y, "bolt").setTint(color).setScale(0.5).setDepth(18);
      this.tweens.add({ targets: dot, x: x + Math.cos(a) * 60, y: y + Math.sin(a) * 60, alpha: 0, scale: 0.1, duration: 420, onComplete: () => dot.destroy() });
    }
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
    for (const [id, b] of this.players) {
      if (id === meId) continue;
      this.interpolate(b, renderT);
    }
    for (const b of this.npcs.values()) this.interpolate(b, renderT);

    const me = this.players.get(meId);
    if (me) {
      this.errorX *= 0.85;
      this.errorY *= 0.85;
      me.container.setPosition(this.mover.x + this.errorX, this.mover.y + this.errorY);
      me.pointer.setPosition(Math.cos(me.aim) * (me.radius + 6), Math.sin(me.aim) * (me.radius + 6)).setRotation(me.aim);
    }

    for (const p of this.projectiles.values()) {
      const t = (now - p.born) / 1000;
      p.sprite.setPosition(p.view.x + p.view.vx * t, p.view.y + p.view.vy * t);
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
      region: regionAt(x, y, this.map.size).name + (nearLoot ? "  ·  [E] pick up" : ""),
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
