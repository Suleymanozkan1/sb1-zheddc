import Phaser from "phaser";

/** Procedurally generated textures: the game ships without binary art assets. */
export function generateTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const make = (key: string, w: number, h: number, draw: () => void): void => {
    if (scene.textures.exists(key)) return;
    g.clear();
    draw();
    g.generateTexture(key, w, h);
  };

  make("disc", 64, 64, () => {
    g.fillStyle(0xffffff, 1).fillCircle(32, 32, 30);
    g.lineStyle(3, 0x000000, 0.35).strokeCircle(32, 32, 29);
  });
  make("glow", 64, 64, () => {
    for (let r = 32; r > 0; r -= 2) g.fillStyle(0xffffff, 0.04).fillCircle(32, 32, r);
  });
  make("ring", 64, 64, () => {
    g.lineStyle(4, 0xffffff, 1).strokeCircle(32, 32, 28);
  });
  make("pointer", 32, 16, () => {
    g.fillStyle(0xffffff, 1).fillTriangle(0, 0, 32, 8, 0, 16);
  });
  make("gem", 28, 28, () => {
    g.fillStyle(0xffffff, 1).fillPoints([new Phaser.Math.Vector2(14, 0), new Phaser.Math.Vector2(28, 14), new Phaser.Math.Vector2(14, 28), new Phaser.Math.Vector2(0, 14)], true);
  });
  make("crystal", 24, 32, () => {
    g.fillStyle(0xffffff, 1).fillPoints([new Phaser.Math.Vector2(12, 0), new Phaser.Math.Vector2(24, 12), new Phaser.Math.Vector2(18, 32), new Phaser.Math.Vector2(6, 32), new Phaser.Math.Vector2(0, 12)], true);
  });
  make("bolt", 20, 20, () => {
    g.fillStyle(0xffffff, 1).fillCircle(10, 10, 8);
  });
  make("arrow", 28, 6, () => {
    g.fillStyle(0xffffff, 1).fillRect(0, 2, 22, 2).fillTriangle(20, 0, 28, 3, 20, 6);
  });
  make("chest", 48, 36, () => {
    g.fillStyle(0xb45309, 1).fillRoundedRect(0, 6, 48, 30, 6);
    g.fillStyle(0xfacc15, 1).fillRect(0, 14, 48, 5).fillRect(20, 10, 8, 14);
  });
  make("grid", 128, 128, () => {
    g.lineStyle(1, 0x22d3ee, 0.07).strokeRect(0, 0, 128, 128);
    g.lineStyle(1, 0x22d3ee, 0.03).lineBetween(64, 0, 64, 128).lineBetween(0, 64, 128, 64);
  });
  g.destroy();
}
