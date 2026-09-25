# Ekonomi denge tablosu

Bu tablodaki tüm değerler koddaki varsayılanlardan ve `prisma/seed.ts`'ten hesaplandı. Kaynaklar:

- `packages/config/src/index.ts`
- `packages/economy/src/rewards.ts`
- `apps/game-server/src/ArenaRoom.ts`
- `packages/game-core/src/{npcs,progression}.ts`
- `apps/api/src/jobs.ts`

Token 6 ondalıklı. `1 ARENA = 1 000 000` birim.

## 1. Parametreler (varsayılan)

| Parametre | Değer | Nerede |
|---|---|---|
| Sezon süresi | 60 gün | seed |
| Sezon ödül havuzu (`SEASON_REWARD_POOL`) | **1 000 000 ARENA** | env |
| Günlük global bütçe (`REWARD_POOL`) | **50 000 ARENA/gün** | env, sezonun `dailyRewardBudget`'ı |
| Oyuncu başına günlük limit (`USER_DAILY_REWARD_CAP`) | **2 000 ARENA/gün** | env |
| PvP kill temel ödülü (`KILL_REWARD_BASE`) | 0.2 ARENA | env |
| Aynı kurbanı tekrar öldürme bekleme süresi | 10 dk | env |
| Sezon çarpanı | 1.0x | `Season.multiplierBps` |
| Çarpan sınırı | her çarpan 0–3x | rewards.ts |
| Dereceli maç | 10 sn geri sayım + 600 sn, **en az 2 oyuncu** | env |
| Titan yeniden doğma | ölümünden 5 dk sonra, oda başına 1 tane | simulation.ts |

## 2. Kripto kaynakları (olay başına)

| Kaynak | Formül | Aralık |
|---|---|---|
| PvP kill (normal) | 0.2 × kurban/katil seviye oranı (0.5–2) | 0.10 – 0.40 |
| PvP kill (dereceli) | yukarıdaki × 1.2 | 0.12 – 0.48 |
| Crystal Titan | sabit 5 | **5.00** (oda başına en fazla 12/saat) |
| Dereceli ilk 3 | 2 × (1.0 / 0.6 / 0.3) | 2.00 / 1.20 / 0.60 |
| Günlük görevler | Hunter 0.5 + Duelist 1.0 | 1.5 / gün |
| Haftalık görevler | Slayer 3 + Champion 2 | 5 / hafta (≈0.71 / gün) |
| Sezon görevi | Season Veteran | 5 (bir kez) |
| Günlük liderlik tablosu | toplam 20, ilk 10'a %25…%2 | 1.: 5.0 · 10.: 0.4 |
| Haftalık liderlik tablosu | toplam 100, ilk 10'a %25…%2 | 1.: 25 · 10.: 2 |

Her ödül dört sınırın en küçüğüne indirilir: havuz bakiyesi, sezonun kalanı, günün kalanı ve oyuncunun günlük limitinin kalanı. Misafir hesaplar ve botlar kripto kazanmaz.

## 3. Normal oyuncu senaryoları (günlük)

Varsayımlar tahmindir; oynayış verisi gelince güncellenmeli.

| Senaryo | Varsayım | ARENA / gün |
|---|---|---|
| **Hafif** (1 saat) | günlük görevler, 5 PvP kill × 0.2, haftalık görevlerin payı | **≈ 3.2** |
| **Aktif** (3 saat) | görevler 2.2 + 20 kill × 0.24 + 6 dereceli maçta 2 kez ilk 3 (ort. 1.27) | **≈ 9.5** |
| **Hardcore / en iyi oyuncu** (8 saat) | görevler 2.2 + 60 kill × 0.3 + 18 dereceli maçın yarısında ilk 3 (ort. 1.4) + 3 Titan + liderlik tablosu 1.'liği | **≈ 56** |

**Sonuç 1:** Kişisel limit (2 000/gün), en iyi dürüst oyuncunun kazancının yaklaşık 36 katı. Bu limit dürüst oyunda hiç devreye girmez; sadece istismar tavanı olarak işe yarar, o da çok yüksek.

## 4. Havuz ne kadar yeter?

| Ölçü | Değer |
|---|---|
| Sezonda sürdürülebilir günlük harcama (1 000 000 / 60) | **≈ 16 667 ARENA/gün** |
| Günlük bütçe her gün dolarsa havuzun bitişi | **20. gün** (sezon 60 gün) |
| Sürdürülebilir hızla desteklenen oyuncu sayısı | ≈ 5 200 hafif · ≈ 1 750 aktif · ≈ 300 hardcore |
| Günlük bütçeyi dolduran oyuncu sayısı | ≈ 5 260 aktif oyuncu · ya da limitte 25 kişi |

**Sonuç 2:** Günlük bütçe (50 000), havuzun sezona yayılmış halinin 3 katı. Bu yüzden yoğun bir sezonda havuz 20 günde bitebilir.

## 5. Kripto → Gem → içerik dönüşümü

| Paket | Fiyat | Gem / ARENA |
|---|---|---|
| 500 Gems | 5 ARENA | 100 |
| 1 200 Gems | 10 ARENA | 120 |
| 3 000 Gems | 22 ARENA | 136 |

Ödül bakiyesi dükkânda da harcanabiliyor. Buna göre:

- Aktif oyuncu (≈9.5 ARENA/gün ≈ 1 140 gem/gün) **yaklaşık 1 günde** şunlardan birini alabilir:
  - Mage (1 200 gem)
  - VIP pass (1 000 gem)
- Hafif oyuncu aynı şeyi yaklaşık 3–4 günde alır.

**Sonuç 3:** Oyun içi kazanç, premium içeriği çok hızlı açıyor. Gem satışı gelir kaynağıysa ödül/fiyat oranı gözden geçirilmeli.

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

| Senaryo | Nasıl | Hesap başına tavan | Durum |
|---|---|---|---|
| **Misafir kurban çiftliği** | Cüzdanlı tek hesap, bot misafir hesapları öldürür. Misafir kurban geçerli sayılıyor ve her yeni misafir yeni kullanıcı olduğundan 10 dk kuralı işlemiyor. | ~360 kill/saat × 0.2 ≈ 72/saat → **≈ 1 700/gün** (7/24 script ile; limitin hemen altında) | ⚠️ açık |
| **İki hesapla dereceli** | `RANKED_MIN_PLAYERS=2`: iki hesap baş başa maç oynar. Birinci 2 + ikinci 1.2 alır. | Çift başına 3.2 / maç × 5.9 maç/saat ≈ **450 ARENA/gün**. ~110 çift global bütçeyi bitirir. | ⚠️ açık |
| **Solo Titan** | Güçlü bir hesap her 5 dakikada Titan'ı keser. | 60/saat → **1 440/gün** (limitin altında) | ⚠️ yüksek |
| **Hesap halkası PvP** | k hesap birbirini 10 dk kuralına uyarak öldürür. | Hesap başına (k−1) × 6 × 0.48 / saat. k=10 için ≈ 620/gün/hesap | ⚠️ ölçekleniyor |
| Aynı ödülü tekrar almak / race | Benzersiz anahtar + havuz kilidi | 0 | ✅ kapalı |
| Aynı anda iki odada oynamak | GameSeat lease | 0 | ✅ kapalı |

## 8. Önerilen ayarlar

Aşağıdakiler öneri; henüz uygulanmadı.

| # | Değişiklik | Etki |
|---|---|---|
| 1 | Kill ödülü yalnızca **cüzdanlı, misafir olmayan ve en az 5. seviye** kurbanda | Misafir çiftliğini kapatır |
| 2 | Dereceli kripto ödülü için **en az 6 gerçek oyuncu**; ödül lobi büyüklüğüyle ölçeklenir (6 kişide %50, 12 kişide %100) | İkili dereceli istismarını kapatır |
| 3 | Titan ödülü **hasar payına göre** bölünür; oyuncu başına günde en fazla 3 Titan ödülü | Solo çiftliği sınırlar |
| 4 | `USER_DAILY_REWARD_CAP` → **100 ARENA** (hardcore oyuncunun ~2 katı) | Tüm istismarlara sert tavan |
| 5 | `REWARD_POOL` (günlük) → **≈ 16 000**, yani sezon havuzu / gün sayısı | Havuz 60 gün dayanır |
| 6 | Aynı kişiden ardışık kill ödülü azalan olsun (1, 0.5, 0.25…) | Halka çiftliğini zayıflatır |
| 7 | Gem paketleri ile ödül oranının gözden geçirilmesi (iş kararı) | Premium içeriğin açılma hızı |

1–3 ve 6 kod değişikliği gerektirir. 4, 5 ve 7 sadece `.env`, veritabanı veya seed ayarıdır.
