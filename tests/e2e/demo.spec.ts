import { expect, test } from "@playwright/test";

test("demo flow: guest → character → arena → inventory → shop → wallet", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "PLAY NOW" }).click();
  await page.getByRole("button", { name: "Play as Guest" }).click();
  await expect(page.getByText("Welcome back")).toBeVisible();

  // Characters: starter heroes are owned.
  await page.getByRole("button", { name: "Characters", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Choose your hero" })).toBeVisible();
  await page.getByRole("button", { name: /Ranger/ }).first().click();
  await page.getByRole("button", { name: /Select for battle|Selected/ }).click();

  // Arena
  await page.getByRole("button", { name: "Play", exact: true }).first().click();
  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/HP$/).first()).toBeVisible({ timeout: 30_000 });
  await page.keyboard.down("d");
  await page.mouse.move(1200, 450);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await page.keyboard.up("d");
  await page.getByRole("button", { name: "⟵ Menu" }).click();

  // Shop: buy potions with gold (server-priced, ledger-backed).
  await page.getByRole("button", { name: "Shop", exact: true }).first().click();
  const potions = page.locator("section", { hasText: "Health Potions x5" });
  await potions.getByRole("button").click();
  await expect(page.getByText("Purchased Health Potions x5")).toBeVisible();

  // Inventory shows the consumables.
  await page.getByRole("button", { name: "Inventory", exact: true }).first().click();
  await expect(page.getByText("Health Potion").first()).toBeVisible();

  // Wallet: limits and append-only ledger are visible.
  await page.getByRole("button", { name: "Wallet", exact: true }).first().click();
  await expect(page.getByText("Ledger (append-only)")).toBeVisible();
  await expect(page.getByText("PURCHASE").first()).toBeVisible();
});

test("offline demo: runs in the browser without calling the API", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "PLAY NOW" }).click();
  // Once in the demo, nothing may reach the API.
  const apiCalls: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) apiCalls.push(r.url());
  });
  await page.getByRole("button", { name: "Try the offline demo" }).click();
  await expect(page.getByText("Offline demo — progress is saved in this browser.")).toBeVisible();
  await expect(page.getByText("DEMO", { exact: true })).toBeVisible();

  // Arena: the simulation runs locally with bots.
  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/HP$/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/\[BOT\]/).first()).toBeVisible();
  await page.keyboard.down("d");
  await page.waitForTimeout(1000);
  await page.keyboard.up("d");
  await page.getByRole("button", { name: "⟵ Menu" }).click();

  // Shop and inventory use the local demo profile; the wallet is hidden.
  await page.getByRole("button", { name: "Shop", exact: true }).first().click();
  await page.locator("section", { hasText: "Health Potions x5" }).getByRole("button").click();
  await expect(page.getByText("Purchased Health Potions x5")).toBeVisible();
  await page.getByRole("button", { name: "Inventory", exact: true }).first().click();
  await expect(page.getByText("Health Potion").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Wallet", exact: true })).toHaveCount(0);

  // Logging out leaves demo mode.
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByRole("button", { name: "PLAY NOW" })).toBeVisible();
  expect(apiCalls).toEqual([]);
});
