# Ekonomi denge tablosu

Bu tablodaki tüm değerler koddaki varsayılanlardan ve `prisma/seed.ts`'ten hesaplandı. Kaynaklar:

- `packages/config/src/index.ts`
- `packages/economy/src/rewards.ts`
- `apps/game-server/src/ArenaRoom.ts`
- `packages/game-core/src/{npcs,progression,rewardRules}.ts`
- `apps/api/src/jobs.ts`

Token 6 ondalıklı. `1 ARENA = 1 000 000` birim.

## 1. Parametreler (varsayılan)

| Parametre | Değer | Nerede |
|---|---|---|
| Sezon süresi | 60 gün | seed |
| Sezon ödül havuzu (`SEASON_REWARD_POOL`) | **1 000 000 ARENA** | env |
| Günlük global bütçe (`REWARD_POOL`) | **16 000 ARENA/gün** (sezon havuzu / 60 gün) | env; sezonun `dailyRewardBudget`'ı ile küçük olanı geçerli |
| Oyuncu başına günlük limit (`USER_DAILY_REWARD_CAP`) | **100 ARENA/gün** | env |
| PvP kill temel ödülü (`KILL_REWARD_BASE`) | 0.2 ARENA | env |
| Aynı kurbanı tekrar öldürme bekleme süresi | 10 dk | env |
| PvP ödülü için kurban şartı (`PVP_REWARD_MIN_VICTIM_LEVEL`) | misafir değil + en az **5. seviye** | env |
| Aynı kurbandan tekrar ödül (`PVP_REPEAT_DECAY_BPS`) | gün içinde her seferinde **×0.5** | env |
| Dereceli ödül eşiği (`RANKED_REWARD_MIN_HUMANS` / `_FULL_HUMANS`) | 6 gerçek oyuncuda %50 → 12'de %100 | env |
| Titan (`TITAN_REWARD_BASE`, `TITAN_MIN_DAMAGE_SHARE_BPS`, `TITAN_REWARDS_PER_USER_DAY`) | 5 ARENA, hasar payına göre, en az %5 hasar, günde en fazla 3 | env |
| Sezon çarpanı | 1.0x | `Season.multiplierBps` |
| Çarpan sınırı | her çarpan 0–3x | rewards.ts |
| Dereceli maç | 10 sn geri sayım + 600 sn, **en az 2 oyuncu** | env |
| Titan yeniden doğma | ölümünden 5 dk sonra, oda başına 1 tane | simulation.ts |

## 2. Kripto kaynakları (olay başına)

| Kaynak | Formül | Aralık |
|---|---|---|
| PvP kill (normal) | 0.2 × kurban/katil seviye oranı (0.5–2) × 0.5^(bugünkü önceki ödül sayısı) | 0.10 – 0.40 (ilk kill) |
| PvP kill (dereceli) | yukarıdaki × 1.2 | 0.12 – 0.48 (ilk kill) |
| Crystal Titan | 5 × hasar payı (en az %5 olanlara) | toplam en fazla **5.00**; oyuncu başına günde 3 ödül |
| Dereceli ilk 3 | 2 × (1.0 / 0.6 / 0.3) × lobi ölçeği (6 kişi %50 → 12 kişi %100) | 2.00 / 1.20 / 0.60 (12+ kişilik lobide) |
| Günlük görevler | Hunter 0.5 + Duelist 1.0 | 1.5 / gün |
| Haftalık görevler | Slayer 3 + Champion 2 | 5 / hafta (≈0.71 / gün) |
| Sezon görevi | Season Veteran | 5 (bir kez) |
| Günlük liderlik tablosu | toplam 20, ilk 10'a %25…%2 | 1.: 5.0 · 10.: 0.4 |
| Haftalık liderlik tablosu | toplam 100, ilk 10'a %25…%2 | 1.: 25 · 10.: 2 |

Her ödül dört sınırın en küçüğüne indirilir: havuz bakiyesi, sezonun kalanı, günün kalanı ve oyuncunun günlük limitinin kalanı. Misafir hesaplar ve botlar kripto kazanmaz; misafir hesaplar ve 5. seviyenin altındaki oyuncular PvP'de kurban olarak da ödül kazandırmaz.

## 3. Normal oyuncu senaryoları (günlük)

Varsayımlar tahmindir; oynayış verisi gelince güncellenmeli.

| Senaryo | Varsayım | ARENA / gün |
|---|---|---|
| **Hafif** (1 saat) | günlük görevler, 5 PvP kill × 0.2, haftalık görevlerin payı | **≈ 3.2** |
| **Aktif** (3 saat) | görevler 2.2 + 20 farklı kurban × 0.24 + 6 dereceli maçta (8–12 kişilik lobi, ölçek ≈ %80) 2 kez ilk 3 | **≈ 9** |
| **Hardcore / en iyi oyuncu** (8 saat) | görevler 2.2 + 60 kill × 0.3 + 18 dereceli maçın yarısında ilk 3 (ölçek ≈ %85) + 3 Titan (tam pay) + liderlik tablosu 1.'liği | **≈ 54** |

**Sonuç 1 (uygulandı):** Kişisel limit 100 ARENA/gün; en iyi dürüst oyuncunun kazancının yaklaşık 2 katı. Dürüst oyunu etkilemez, istismara sert tavan koyar.

## 4. Havuz ne kadar yeter?

| Ölçü | Değer |
|---|---|
| Sezonda sürdürülebilir günlük harcama (1 000 000 / 60) | **≈ 16 667 ARENA/gün** |
| Günlük bütçe (16 000) her gün dolarsa havuzun bitişi | **≈ 62. gün** (sezon 60 gün) ✅ |
| Günlük bütçeyle desteklenen oyuncu sayısı | ≈ 5 000 hafif · ≈ 1 780 aktif · ≈ 300 hardcore |
| Günlük bütçeyi dolduran oyuncu sayısı | ≈ 1 780 aktif oyuncu · ya da limitte 160 kişi |

**Sonuç 2 (uygulandı):** Günlük bütçe artık sezon havuzunun güne bölünmüş hali; en yoğun sezonda bile havuz sezon sonuna kadar dayanır. Daha fazla oyuncu için sezon havuzu (`SEASON_REWARD_POOL`) büyütülmeli.

## 5. Kripto → Gem → içerik dönüşümü

| Paket | Fiyat | Gem / ARENA |
|---|---|---|
| 500 Gems | 5 ARENA | 100 |
| 1 200 Gems | 10 ARENA | 120 |
| 3 000 Gems | 22 ARENA | 136 |

Ödül bakiyesi dükkânda da harcanabiliyor. Buna göre:

- Aktif oyuncu (≈9 ARENA/gün ≈ 1 080 gem/gün) **yaklaşık 1 günde** şunlardan birini alabilir:
  - Mage (1 200 gem)
  - VIP pass (1 000 gem)
- Hafif oyuncu aynı şeyi yaklaşık 3–4 günde alır.

**Sonuç 3 (açık, iş kararı):** Oyun içi kazanç, premium içeriği çok hızlı açıyor. Gem satışı gelir kaynağıysa ödül/fiyat oranı gözden geçirilmeli. Fiyatlar veritabanındaki `ShopProduct` kayıtlarından (seed) gelir; kod değişikliği gerekmez.

## 6. Gold dengesi

| Kaynak | Gold |
|---|---|
| Canavar kill | slime 2–6 · wolf 5–12 · stalker 12–26 · golem 30–70 · wraith 70–160 · titan 800–1 500 · chest 20–60 |
| Kaynak toplama | scrap 4 · crystal 10 · core shard 24 |
| PvP kill | 10 + 3 × kurban seviyesi |
| Günlük görevler | 1 100 (+600 VIP) |

| Harcama | Gold |
|---|---|
| İksir paketi (5 adet) | 150 |
| 98 stat puanı, 6 stata eşit dağıtılırsa | ≈ **20 600** |
| Tüm puanlar tek bir stata (1.18^n) | ≈ 2.95 milyar (pratikte imkânsız) |
| Eşyayı +20'ye çıkarmak | COMMON 57 611 · RARE 115 217 · EPIC 172 833 · LEGENDARY 259 248 · MYTHIC 403 272 |
| Karakter (gold ile) | Assassin 25 000 · Mage 40 000 |
| Dükkân eşyaları | Neon Blade / Longbow 3 000 · Striders 1 200 |

**XP eğrisi:**

| Seviye | Toplam XP |
|---|---|
| 10 | 13 372 |
| 20 | 86 877 |
| 30 | 254 960 |
| 50 | 979 417 |

Oyuncu seviye başına 2 stat puanı alır, 50. seviyeye kadar toplam 98.

**Sonuç 4:** Eşya yükseltmesi en büyük gold harcama kalemi. Stat maliyeti tek stata yığılmayı engelliyor, bu bilinçli bir tasarım.

## 7. İstismar tavanları (kod incelemesiyle doğrulandı)

Tüm satırlar ayrıca hesap başına **100 ARENA/gün** kişisel limit ve günlük global bütçeyle sınırlıdır.

| Senaryo | Nasıl | Önce | Şimdi |
|---|---|---|---|
| **Misafir kurban çiftliği** | Cüzdanlı hesap, bot misafir hesapları öldürür | ≈ 1 700/gün | **0** — misafir ve 5. seviye altı kurban ödül vermez ✅ |
| **İki hesapla dereceli** | İki hesap baş başa dereceli oynar | ≈ 450/gün/çift | **0** — 6 gerçek oyuncu altında dereceli kripto yok ✅ |
| **Altı hesapla dereceli** | 6 sahte hesap (hepsi misafir değil) aynı lobide | — | Maç başına (2+1.2+0.6)×%50 = 1.9, 6 hesaba ≈ 45/gün/hesap; 100 limitin altında ⚠️ (her hesap cüzdan + seviye gerektirir) |
| **Solo Titan** | Güçlü hesap her 5 dk Titan keser | ≈ 1 440/gün | **≤ 15/gün** — günde 3 ödül × 5 ✅ |
| **Hesap halkası PvP** | k hesap birbirini öldürür | ≈ 620/gün/hesap (k=10) | Her çift günde ≤ 0.48 × (1 + ½ + ¼ + …) ≈ 0.96 → **≈ 8.6/gün/hesap** (k=10) ✅ |
| Aynı ödülü tekrar almak / race | Benzersiz anahtar + havuz kilidi | 0 | 0 ✅ |
| Aynı anda iki odada oynamak | GameSeat lease (fencing token) | 0 | 0 ✅ |

## 8. Uygulanan ayarlar

| # | Değişiklik | Durum |
|---|---|---|
| 1 | Kill ödülü yalnızca **misafir olmayan (cüzdanlı) ve en az 5. seviye** kurbanda | ✅ `PVP_REWARD_MIN_VICTIM_LEVEL` |
| 2 | Dereceli kripto için **en az 6 gerçek oyuncu**; 6 kişide %50 → 12 kişide %100 | ✅ `RANKED_REWARD_MIN_HUMANS` / `RANKED_REWARD_FULL_HUMANS` |
| 3 | Titan ödülü **hasar payına göre** (en az %5); oyuncu başına günde en fazla 3 | ✅ `TITAN_*` |
| 4 | `USER_DAILY_REWARD_CAP` → **100 ARENA** | ✅ varsayılan değer |
| 5 | `REWARD_POOL` (günlük) → **16 000 ARENA** | ✅ varsayılan değer |
| 6 | Aynı kurbandan gün içindeki ardışık kill ödülü ×0.5 azalır | ✅ `PVP_REPEAT_DECAY_BPS` |
| 7 | Gem paketleri ile ödül oranının gözden geçirilmesi | ⏳ iş kararı (bkz. Sonuç 3) |

Mevcut bir kurulumda `.env` dosyasındaki eski `REWARD_POOL` / `USER_DAILY_REWARD_CAP` değerleri varsayılanları ezer; yeni değerlerle güncellenmelidir.
Aktif sezonun `dailyRewardBudget` değeri daha yüksek kalsa bile motor ikisinden küçük olanı kullanır.
