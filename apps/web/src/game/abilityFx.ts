// Cosmetic effects for skills (Q) and ultimates (R). Purely visual: the server (or the demo
// simulation) already decided every hit; these only make the cast readable and punchy.
import type { AbilityDef } from "@cryptoarena/game-core";
import Phaser from "phaser";

const DISPLAY_FONT = "Orbitron, Inter, system-ui, sans-serif";

export interface FxTarget {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  baseScale: number;
  baseTint: number | null;
  radius: number;
  /** Scene time until which the per-frame animation leaves the body's rotation / scale alone. */
  spinUntil: number;
  poseUntil: number;
}

export interface FxHost {
  scene: Phaser.Scene;
  sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  embers: Phaser.GameObjects.Particles.ParticleEmitter;
  hq: boolean;
  /** Screen shake, only honoured when the player enabled it. */
  shake(durationMs: number, intensity: number): void;
}

/** Signature colours per ability; fall back to cyan (skill) / magenta (ultimate). */
const COLORS: Record<string, number> = {
  whirlwind: 0x7dd3fc,
  berserk: 0xef4444,
  shadow_step: 0xa855f7,
  vanish: 0x7c3aed,
  ground_slam: 0xf59e0b,
  fortress: 0xfacc15,
  multishot: 0x38bdf8,
  hawk_eye: 0x4ade80,
  nova: 0x67e8f9,
  meteor: 0xf97316,
};

/** Scale for the 256 px ring/slash textures so the drawn radius matches `radius` world units. */
const ringScale = (radius: number): number => (radius * 2) / 220;

export function playAbility(host: FxHost, t: FxTarget, ability: AbilityDef, kind: "skill" | "ultimate", aim: number, isSelf: boolean): void {
  const color = COLORS[ability.key] ?? (kind === "ultimate" ? 0xe879f9 : 0x22d3ee);
  castPose(host, t, color, kind);
  callout(host, t, ability.name, color, kind);
  if (isSelf) host.shake(kind === "ultimate" ? 220 : 110, kind === "ultimate" ? 0.008 : 0.004);

  for (const e of ability.effects) {
    switch (e.type) {
      case "aoe":
        if (ability.key === "whirlwind") whirlwind(host, t, e.radius, color);
        else if (ability.key === "ground_slam") slam(host, t, e.radius, color, isSelf);
        else nova(host, t, e.radius, color);
        break;
      case "cone":
        cone(host, t, aim, e.range, color);
        break;
      case "blink":
        blink(host, t, aim, e.distance, e.radius, color);
        break;
      case "multishot":
        fan(host, t, aim, e.count, e.spread, color);
        break;
      case "buff":
        aura(host, t, e.durationMs, color, !!e.invisible);
        break;
      case "heal":
        heal(host, t);
        break;
      case "meteor":
        meteor(host, t, aim, Math.min(e.range, 650), e.radius, e.delayMs, color, isSelf);
        break;
    }
  }
}

/** Squash-and-stretch plus a white flash on the caster. */
function castPose(host: FxHost, t: FxTarget, color: number, kind: "skill" | "ultimate"): void {
  const { scene } = host;
  const s = t.baseScale;
  const punch = kind === "ultimate" ? 1.35 : 1.2;
  t.poseUntil = Math.max(t.poseUntil, scene.time.now + 200);
  scene.tweens.add({ targets: t.body, scaleX: s * punch, scaleY: s * punch, duration: 90, yoyo: true, ease: "Quad.easeOut" });
  // A short white flash sells the ultimate; skills only get the coloured burst.
  if (kind === "ultimate") t.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
  scene.time.delayedCall(60, () => {
    if (!t.body.scene) return;
    t.body.setTintMode(Phaser.TintModes.MULTIPLY);
    if (t.baseTint === null) t.body.clearTint();
    else t.body.setTint(t.baseTint);
  });
  const { x, y } = t.container;
  const flash = scene.add.image(x, y, "fx_soft").setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(18).setScale((t.radius * 4) / 128).setAlpha(0.6);
  scene.tweens.add({ targets: flash, alpha: 0, scale: flash.scale * 1.6, duration: 320, onComplete: () => flash.destroy() });
}

function callout(host: FxHost, t: FxTarget, name: string, color: number, kind: "skill" | "ultimate"): void {
  const { scene } = host;
  const css = `#${color.toString(16).padStart(6, "0")}`;
  const text = scene.add
    .text(t.container.x, t.container.y - t.radius - 48, name.toUpperCase(), {
      fontFamily: DISPLAY_FONT,
      fontSize: kind === "ultimate" ? "20px" : "15px",
      fontStyle: "bold",
      color: css,
      stroke: "#020617",
      strokeThickness: 5,
    })
    .setOrigin(0.5)
    .setDepth(60)
    .setScale(0.4);
  scene.tweens.add({ targets: text, scale: 1, duration: 160, ease: "Back.easeOut" });
  scene.tweens.add({ targets: text, y: text.y - 36, alpha: 0, delay: 500, duration: 500, onComplete: () => text.destroy() });
}

function ring(host: FxHost, x: number, y: number, radius: number, color: number, duration: number, depth = 19, from = 0.15): Phaser.GameObjects.Image {
  const img = host.scene.add.image(x, y, "fx_ring").setTint(color).setDepth(depth).setScale(ringScale(radius) * from).setBlendMode(Phaser.BlendModes.ADD);
  host.scene.tweens.add({ targets: img, scale: ringScale(radius), alpha: 0, duration, ease: "Cubic.easeOut", onComplete: () => img.destroy() });
  return img;
}

/** Warrior Q: the hero spins while blades sweep around it. */
function whirlwind(host: FxHost, t: FxTarget, radius: number, color: number): void {
  const { scene } = host;
  t.spinUntil = scene.time.now + 430;
  scene.tweens.add({ targets: t.body, angle: t.body.angle + 720, duration: 420, ease: "Cubic.easeOut" });
  for (let i = 0; i < 3; i++) {
    const arc = scene.add
      .image(0, 0, "fx_slash")
      .setScale(ringScale(radius) * (0.75 + i * 0.12))
      .setRotation((i * Math.PI * 2) / 3)
      .setTint(i === 1 ? 0x93c5fd : color)
      .setAlpha(0.9)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(20);
    t.container.add(arc);
    scene.tweens.add({ targets: arc, rotation: arc.rotation + Math.PI * 3, alpha: 0, duration: 460, ease: "Cubic.easeOut", onComplete: () => arc.destroy() });
  }
  ring(host, t.container.x, t.container.y, radius, color, 420);
  host.sparks.setParticleTint(color).explode(host.hq ? 24 : 8, t.container.x, t.container.y);
}

/** Tank Q: the hero leaps and crashes down; a shockwave and dust roll outwards. */
function slam(host: FxHost, t: FxTarget, radius: number, color: number, isSelf: boolean): void {
  const { scene } = host;
  const s = t.baseScale;
  t.poseUntil = scene.time.now + 330;
  scene.tweens.chain({
    targets: t.body,
    tweens: [
      { scaleX: s * 1.35, scaleY: s * 1.35, duration: 120, ease: "Quad.easeOut" },
      { scaleX: s * 1.25, scaleY: s * 0.75, duration: 70, ease: "Quad.easeIn" },
      { scaleX: s, scaleY: s, duration: 120, ease: "Back.easeOut" },
    ],
  });
  scene.time.delayedCall(190, () => {
    const { x, y } = t.container;
    ring(host, x, y, radius, color, 480);
    ring(host, x, y, radius * 0.65, 0xffffff, 300, 20);
    const crack = scene.add.image(x, y, "fx_soft").setTint(0x78350f).setScale(ringScale(radius) * 1.6).setAlpha(0.7).setDepth(3);
    scene.tweens.add({ targets: crack, alpha: 0, duration: 900, onComplete: () => crack.destroy() });
    host.embers.setParticleTint(0xfbbf24).explode(host.hq ? 30 : 10, x, y);
    host.sparks.setParticleTint(color).explode(host.hq ? 20 : 6, x, y);
    if (isSelf) host.shake(180, 0.01);
  });
}

/** Mage Q: a double frost ring with ice shards. */
function nova(host: FxHost, t: FxTarget, radius: number, color: number): void {
  const { x, y } = t.container;
  ring(host, x, y, radius, color, 450);
  host.scene.time.delayedCall(90, () => ring(host, t.container.x, t.container.y, radius * 0.8, 0xffffff, 380, 20));
  host.sparks.setParticleTint(0xe0f2fe).explode(host.hq ? 36 : 12, x, y);
  host.embers.setParticleTint(color).explode(host.hq ? 16 : 6, x, y);
}

function cone(host: FxHost, t: FxTarget, aim: number, range: number, color: number): void {
  const { scene } = host;
  const arc = scene.add
    .image(t.container.x, t.container.y, "fx_slash")
    .setRotation(aim - 0.6)
    .setScale(ringScale(range))
    .setTint(color)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(20);
  scene.tweens.add({ targets: arc, rotation: aim + 0.6, alpha: 0, duration: 260, ease: "Cubic.easeOut", onComplete: () => arc.destroy() });
}

/** Assassin Q: a shadow streak from where the hero stood to where it lands. */
function blink(host: FxHost, t: FxTarget, aim: number, distance: number, radius: number, color: number): void {
  const { scene } = host;
  const x0 = t.container.x;
  const y0 = t.container.y;
  const x1 = x0 + Math.cos(aim) * distance;
  const y1 = y0 + Math.sin(aim) * distance;
  for (let i = 0; i <= 5; i++) {
    const f = i / 5;
    const ghost = scene.add
      .image(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, t.body.texture.key)
      .setRotation(aim)
      .setScale(t.baseScale)
      .setTint(color)
      .setTintMode(Phaser.TintModes.FILL)
      .setAlpha(0.15 + 0.5 * f)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(9);
    scene.tweens.add({ targets: ghost, alpha: 0, delay: i * 25, duration: 380, onComplete: () => ghost.destroy() });
  }
  host.embers.setParticleTint(0x4c1d95).explode(host.hq ? 18 : 6, x0, y0);
  ring(host, x1, y1, radius, color, 360);
  host.sparks.setParticleTint(color).explode(host.hq ? 22 : 8, x1, y1);
}

/** Ranger Q: a muzzle flash for each arrow in the fan. */
function fan(host: FxHost, t: FxTarget, aim: number, count: number, spread: number, color: number): void {
  const { scene } = host;
  for (let i = 0; i < count; i++) {
    const a = aim + (count === 1 ? 0 : -spread / 2 + (spread * i) / (count - 1));
    const x = t.container.x + Math.cos(a) * (t.radius + 18);
    const y = t.container.y + Math.sin(a) * (t.radius + 18);
    const streak = scene.add.image(x, y, "fx_pillar").setRotation(a + Math.PI / 2).setScale(0.35, 0.5).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(21);
    scene.tweens.add({ targets: streak, alpha: 0, scaleY: 0.9, duration: 220, onComplete: () => streak.destroy() });
    host.sparks.setParticleTint(color).explode(host.hq ? 4 : 2, x, y);
  }
}

/** Ultimate buffs: a pulsing aura that follows the hero for the whole duration. */
function aura(host: FxHost, t: FxTarget, durationMs: number, color: number, invisible: boolean): void {
  const { scene } = host;
  const r = t.radius;
  const glow = scene.add.image(0, 0, "fx_soft").setTint(color).setScale((r * 5) / 128).setAlpha(0.75).setBlendMode(Phaser.BlendModes.ADD);
  const halo = scene.add.image(0, 0, "fx_ring").setTint(color).setScale(ringScale(r * 1.6)).setAlpha(0.8).setBlendMode(Phaser.BlendModes.ADD);
  t.container.addAt(glow, 1);
  t.container.addAt(halo, 2);
  scene.tweens.add({ targets: glow, alpha: 0.2, scale: glow.scale * 1.2, yoyo: true, repeat: -1, duration: 420, ease: "Sine.easeInOut" });
  scene.tweens.add({ targets: halo, angle: 360, repeat: -1, duration: 1400 });
  const pillar = scene.add.image(t.container.x, t.container.y, "fx_pillar").setOrigin(0.5, 0.95).setTint(color).setScale(1.6, 0.2).setAlpha(0.9).setBlendMode(Phaser.BlendModes.ADD).setDepth(25);
  scene.tweens.add({ targets: pillar, scaleY: 1.8, alpha: 0, duration: 700, ease: "Cubic.easeOut", onComplete: () => pillar.destroy() });
  ring(host, t.container.x, t.container.y, r * 4, color, 500);
  if (invisible) host.embers.setParticleTint(0x1e1b4b).explode(host.hq ? 30 : 10, t.container.x, t.container.y);
  // Embers rise from the hero while the buff lasts.
  const tick = scene.time.addEvent({
    delay: 140,
    repeat: Math.floor(durationMs / 140),
    callback: () => {
      if (!t.container.scene || !t.container.visible) return;
      host.embers.setParticleTint(color).emitParticleAt(t.container.x + Phaser.Math.Between(-r, r), t.container.y + Phaser.Math.Between(-r, r), host.hq ? 2 : 1);
    },
  });
  scene.time.delayedCall(durationMs, () => {
    tick.remove();
    for (const o of [glow, halo]) {
      scene.tweens.killTweensOf(o);
      if (!o.scene) continue;
      scene.tweens.add({ targets: o, alpha: 0, duration: 300, onComplete: () => o.destroy() });
    }
  });
}

function heal(host: FxHost, t: FxTarget): void {
  const { scene } = host;
  for (let i = 0; i < 8; i++) {
    const plus = scene.add
      .text(t.container.x + Phaser.Math.Between(-t.radius, t.radius), t.container.y + Phaser.Math.Between(-10, 20), "+", { fontFamily: DISPLAY_FONT, fontSize: "22px", fontStyle: "bold", color: "#4ade80", stroke: "#052e16", strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(55);
    scene.tweens.add({ targets: plus, y: plus.y - 60 - i * 4, alpha: 0, delay: i * 60, duration: 700, onComplete: () => plus.destroy() });
  }
  host.embers.setParticleTint(0x4ade80).explode(host.hq ? 20 : 8, t.container.x, t.container.y);
}

/** Mage R: a target marker fills up while the meteor falls, then a heavy impact. */
function meteor(host: FxHost, t: FxTarget, aim: number, distance: number, radius: number, delayMs: number, color: number, isSelf: boolean): void {
  const { scene } = host;
  const x = t.container.x + Math.cos(aim) * distance;
  const y = t.container.y + Math.sin(aim) * distance;
  const marker = scene.add.image(x, y, "fx_ring").setTint(0xef4444).setScale(ringScale(radius)).setAlpha(0.7).setDepth(4);
  const fill = scene.add.image(x, y, "fx_soft").setTint(color).setScale(0.05).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(4);
  scene.tweens.add({ targets: marker, angle: 90, duration: delayMs });
  scene.tweens.add({ targets: fill, scale: ringScale(radius) * 1.9, duration: delayMs, ease: "Quad.easeIn" });

  const rock = scene.add.image(x - 420, y - 620, "fx_soft").setTint(color).setScale(0.9).setBlendMode(Phaser.BlendModes.ADD).setDepth(40);
  const core = scene.add.image(rock.x, rock.y, "fx_soft").setTint(0xfff7ed).setScale(0.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(41);
  const trail = scene.time.addEvent({ delay: 16, repeat: Math.ceil(delayMs / 16), callback: () => host.embers.setParticleTint(color).emitParticleAt(rock.x, rock.y, host.hq ? 3 : 1) });
  scene.tweens.add({ targets: [rock, core], x, y, duration: delayMs, ease: "Quad.easeIn" });

  scene.time.delayedCall(delayMs, () => {
    trail.remove();
    for (const o of [marker, fill, rock, core]) o.destroy();
    ring(host, x, y, radius * 1.2, color, 600);
    ring(host, x, y, radius * 0.8, 0xffffff, 420, 20);
    const blast = scene.add.image(x, y, "fx_soft").setTint(0xfdba74).setScale(ringScale(radius) * 2.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(18);
    scene.tweens.add({ targets: blast, alpha: 0, duration: 500, onComplete: () => blast.destroy() });
    const scorch = scene.add.image(x, y, "fx_soft").setTint(0x1c1917).setScale(ringScale(radius) * 1.8).setAlpha(0.6).setDepth(3);
    scene.tweens.add({ targets: scorch, alpha: 0, delay: 1200, duration: 1500, onComplete: () => scorch.destroy() });
    host.sparks.setParticleTint(0xfbbf24).explode(host.hq ? 40 : 14, x, y);
    host.embers.setParticleTint(color).explode(host.hq ? 36 : 12, x, y);
    if (isSelf) host.shake(260, 0.014);
  });
}
