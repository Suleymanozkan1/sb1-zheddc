import { ProductCategory, type ShopProductDto } from "@cryptoarena/shared";
import { Button, Panel, Spinner, cx } from "@cryptoarena/ui";
import { useState } from "react";
import { Page } from "../components/Layout";
import { RarityTag } from "../components/RarityTag";
import { useT, useTc } from "../lib/i18n";
import { api } from "../lib/api";
import { CURRENCY_ICON, price } from "../lib/format";
import { errorMessage, useApp } from "../lib/store";
import { useAsync } from "../lib/useAsync";

const LABEL: Record<string, string> = {
  CHARACTER: "Characters",
  SKIN: "Skins",
  WEAPON: "Weapons",
  EQUIPMENT: "Equipment",
  BOOST: "Boosts",
  PREMIUM_PASS: "Premium Pass",
  COSMETIC: "Cosmetics",
  GEMS: "Gems",
  CONSUMABLE: "Consumables",
};

export function Shop() {
  const { me, setBalances, toast } = useApp();
  const shop = useAsync(() => api.shop(), []);
  const t = useT();
  const tc = useTc();
  const [cat, setCat] = useState<string>("ALL");
  const [busy, setBusy] = useState<string | null>(null);
  const products = (shop.data ?? []).filter((p) => cat === "ALL" || p.category === cat);

  const buy = async (p: ShopProductDto) => {
    setBusy(p.sku);
    try {
      const res = await api.purchase(p.sku);
      setBalances(res.balances);
      toast("success", t("Purchased {name}", { name: tc("product", p.sku, p.name) }));
      await shop.reload();
    } catch (err) {
      toast("error", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page title={t("Shop")} subtitle={t("Prices are managed server-side. Purchases buy in-game items, cosmetics and utility — never financial returns.")}>
      <div className="mb-4 flex flex-wrap gap-1">
        {["ALL", ...ProductCategory].map((c) => (
          <button key={c} onClick={() => setCat(c)} className={cx("rounded-lg px-3 py-1 text-xs font-semibold", cat === c ? "bg-cyan-400 text-black" : "bg-white/5 text-slate-300")}>
            {c === "ALL" ? t("All") : t(LABEL[c] ?? c)}
          </button>
        ))}
      </div>
      {shop.loading && !shop.data ? (
        <Spinner />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => (
            <Panel key={p.id} className={cx("flex flex-col", p.metadata.highlight && "border-fuchsia-400/50")}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] tracking-widest text-slate-400 uppercase">{t(LABEL[p.category] ?? p.category)}</p>
                  <h3 className="font-display font-bold">{tc("product", p.sku, p.name)}</h3>
                </div>
                <RarityTag rarity={p.rarity} />
              </div>
              <p className="mb-4 flex-1 text-sm text-slate-400">{tc("productDesc", p.sku, p.description)}</p>
              <Button variant={p.currency === "CRYPTO" ? "primary" : "secondary"} disabled={p.owned} loading={busy === p.sku} onClick={() => void buy(p)}>
                {p.owned ? t("Owned") : `${CURRENCY_ICON[p.currency]} ${price(p.price, p.currency, me?.balances)}`}
              </Button>
              {p.currency === "CRYPTO" && <p className="mt-2 text-[10px] text-slate-500">{t("Paid from deposited balance first, then reward balance.")}</p>}
            </Panel>
          ))}
        </div>
      )}
    </Page>
  );
}
