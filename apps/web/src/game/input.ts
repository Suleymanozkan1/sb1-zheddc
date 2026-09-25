// Input sources produce intent only (movement vector, aim, buttons). Keyboard/mouse is the
// default; TouchInput provides twin-stick controls for mobile. Both implement InputSource.
import { Buttons } from "@cryptoarena/shared";
import Phaser from "phaser";

export interface InputFrame {
  mx: number;
  my: number;
  aim: number;
  buttons: number;
}

export interface InputSource {
  read(playerScreenX: number, playerScreenY: number): InputFrame;
  consumeAction(action: "pickup" | "potion" | "buy" | "scoreboard"): boolean;
  destroy(): void;
}

export class KeyboardMouseInput implements InputSource {
  private readonly keys: Record<string, Phaser.Input.Keyboard.Key>;
  private readonly scene: Phaser.Scene;
  private readonly pending = new Set<string>();
  private readonly onKey: (e: KeyboardEvent) => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,Q,R") as Record<string, Phaser.Input.Keyboard.Key>;
    this.onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === "e") this.pending.add("pickup");
      if (k === "f") this.pending.add("potion");
      if (k === "b") this.pending.add("buy");
    };
    window.addEventListener("keydown", this.onKey);
    scene.input.mouse?.disableContextMenu();
  }

  read(px: number, py: number): InputFrame {
    const k = this.keys;
    let mx = 0;
    let my = 0;
    if (k.A!.isDown || k.LEFT!.isDown) mx -= 1;
    if (k.D!.isDown || k.RIGHT!.isDown) mx += 1;
    if (k.W!.isDown || k.UP!.isDown) my -= 1;
    if (k.S!.isDown || k.DOWN!.isDown) my += 1;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
    }
    const pointer = this.scene.input.activePointer;
    const aim = Math.atan2(pointer.y - py, pointer.x - px);
    let buttons = 0;
    if (pointer.leftButtonDown()) buttons |= Buttons.ATTACK;
    if (pointer.rightButtonDown() || k.SPACE!.isDown || k.SHIFT!.isDown) buttons |= Buttons.DASH;
    if (k.Q!.isDown) buttons |= Buttons.SKILL;
    if (k.R!.isDown) buttons |= Buttons.ULTIMATE;
    return { mx, my, aim, buttons };
  }

  consumeAction(action: "pickup" | "potion" | "buy" | "scoreboard"): boolean {
    return this.pending.delete(action);
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKey);
  }
}

/** Twin-stick touch controls: left half = move stick, right half = aim + auto-attack. */
export class TouchInput implements InputSource {
  private moveId: number | null = null;
  private aimId: number | null = null;
  private moveOrigin = { x: 0, y: 0 };
  private move = { x: 0, y: 0 };
  private aim = 0;
  private attacking = false;
  readonly buttons = { dash: false, skill: false, ultimate: false };
  private readonly pending = new Set<string>();
  private readonly scene: Phaser.Scene;
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    scene.input.addPointer(2);
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(1000);
    scene.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.x < scene.scale.width / 2 && this.moveId === null) {
        this.moveId = p.id;
        this.moveOrigin = { x: p.x, y: p.y };
      } else if (this.aimId === null) {
        this.aimId = p.id;
        this.attacking = true;
      }
    });
    scene.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (p.id === this.moveId) {
        const dx = p.x - this.moveOrigin.x;
        const dy = p.y - this.moveOrigin.y;
        const d = Math.hypot(dx, dy);
        const m = Math.min(1, d / 60);
        this.move = d > 4 ? { x: (dx / d) * m, y: (dy / d) * m } : { x: 0, y: 0 };
      }
    });
    scene.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (p.id === this.moveId) {
        this.moveId = null;
        this.move = { x: 0, y: 0 };
      }
      if (p.id === this.aimId) {
        this.aimId = null;
        this.attacking = false;
      }
    });
  }

  read(px: number, py: number): InputFrame {
    if (this.aimId !== null) {
      const p = this.scene.input.manager.pointers.find((pt) => pt.id === this.aimId);
      if (p) this.aim = Math.atan2(p.y - py, p.x - px);
    } else if (this.move.x !== 0 || this.move.y !== 0) {
      this.aim = Math.atan2(this.move.y, this.move.x);
    }
    this.gfx.clear();
    if (this.moveId !== null) {
      this.gfx.lineStyle(2, 0x22d3ee, 0.6).strokeCircle(this.moveOrigin.x, this.moveOrigin.y, 60);
      this.gfx.fillStyle(0x22d3ee, 0.5).fillCircle(this.moveOrigin.x + this.move.x * 60, this.moveOrigin.y + this.move.y * 60, 22);
    }
    let buttons = this.attacking ? Buttons.ATTACK : 0;
    if (this.buttons.dash) buttons |= Buttons.DASH;
    if (this.buttons.skill) buttons |= Buttons.SKILL;
    if (this.buttons.ultimate) buttons |= Buttons.ULTIMATE;
    return { mx: this.move.x, my: this.move.y, aim: this.aim, buttons };
  }

  trigger(action: "pickup" | "potion" | "buy"): void {
    this.pending.add(action);
  }

  consumeAction(action: "pickup" | "potion" | "buy" | "scoreboard"): boolean {
    return this.pending.delete(action);
  }

  destroy(): void {
    this.gfx.destroy();
  }
}

export function isTouchDevice(): boolean {
  return typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0) && window.matchMedia("(pointer: coarse)").matches;
}
