# Dukaan Medicos — 3D Pharmacy Cashier Trainer

A 3D first-person **pharmacy cashier / mental-math transaction trainer**. You sit behind
the counter of a small medical store, read real medicine MRPs (from the repository's
`Stock Record (1).csv`), apply discounts, handle partial quantities (e.g. *3 tablets from a
strip of 10*), receive cash, calculate change, and physically hand back the right notes
and coins — all under time pressure from a queue of impatient customers.

It *feels* like running a real shop. Under the hood it is a repetition engine for the exact
arithmetic a real counter demands:

- `₹500 − ₹137 = ₹363`
- `10% of ₹250 = ₹25 → sell at ₹225`
- `₹100 strip of 10 → ₹10/tablet → 3 tablets = ₹30`

## ▶️ Play / Download

- **Live web build (dev preview):** served by this workspace's dev server.
- **Android APK (direct download):**
  <https://github.com/jojokundesu/Medicines-stock/releases/download/apk-build/app-debug.apk>
  (≈ 4 MB, debug-signed, installable. On Android, allow *"Install from unknown sources"*.)

Every push to the session branch rebuilds the APK via GitHub Actions and republishes it to
the `apk-build` release (`.github/workflows/build-apk.yml`).

## 🎮 Core loop

customer enters → requests products → you read MRPs on the counter → compute quantity &
discount totals → customer pays (notes laid on the counter) → you compute change →
you pick notes/coins from the cash drawer → instant feedback → next customer.

## 🧮 Mechanics implemented

- Real medicine data: 1,784 cleaned products from `Stock Record (1).csv` (category, MRP,
  pack size, strip/unit pricing).
- Whole-rupee billing (v1), exact CSV MRPs retained as `mrpExact` for a future paisa mode.
- Partial quantity: strips/capsules whose MRP divides evenly per unit (127 items) support
  "N loose tablets" pricing (e.g. ₹100/10 → 3 tabs = ₹30).
- Discounts: shop-wide, per-product, and additive "bargain" %, rounded per standard retail.
- Currency: full ₹ denomination set (notes ₹10–₹2000, coins ₹1–₹20), integer-paise math,
  greedy + drawer-constrained change making, persistent cash-drawer inventory.
- Customers with personalities (patient, impatient, bargain, big-order, large-note, …),
  patience timers, and per-stage timing (order/bill/pay/change/cashout).
- Calculator (+, −, ×, ÷, %) — usage tracked, never penalized; hints teach *counting up*.
- Error classification (forgot-discount, discount-twice, payment-recognition,
  wrong-denomination, …) with post-transaction + end-of-shift reports.

## 🛠 Tech

React 18 + TypeScript + Vite, Three.js (low-poly first-person shop), Zustand, Web Audio
(synthesized SFX), PWA (web), Capacitor 6 (Android). The transaction engine is fully
decoupled from the 3D layer so new shop types / modes can be added independently.

## ✅ Systematic testing (run these between changes)

```bash
npm run data      # rebuild public/data/medicines.json from the CSV
npm test          # 31 unit + fuzz + UI-loop tests (vitest)
npm run fuzz      # 8,000-scenario invariant fuzz harness
npm run build     # type-check + production build
npm run check     # all of the above, in order
```

The engine is validated against 20,000+ generated transactions: bills always match
payment − change, change is always makeable, and money stays integer-paise.

## 📱 Build the APK yourself

```bash
npm ci
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug   # requires JDK 17 + Android SDK 34
```

or just push to the branch — CI does it and updates the release.

> Note: this app is a **transaction-training simulator**. It teaches quantity + pricing +
> discount + change arithmetic only. It does not give medical advice, dosing, or
> prescription guidance.
