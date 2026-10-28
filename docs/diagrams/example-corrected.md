# ตัวอย่างไดอะแกรมฉบับแก้ตามโค้ด

ใช้แทนตัวอย่าง 6 หัวข้อที่แนบมา โดยคงขอบเขต as-is ของโค้ดที่ตรวจ ไม่ใช่ข้อเสนอให้เพิ่มฟังก์ชัน

รายละเอียดจุดแก้และการเทียบ PDF อยู่ใน [thesis-review.md](thesis-review.md)

## 1. System Architecture

```mermaid
flowchart TB
    User["ผู้ใช้งานผ่าน Browser"] --> UI
    subgraph Browser["Client: React 19"]
      UI["Next.js pages: Dashboard / Portfolio / Ledger / Bucket / Trade / Terminal"]
      Context["AppContext: shared state and financial operations"]
      SDK["Supabase client and db helpers"]
      FX["useFxRate: shared singleton"]
      Symbol["useSharedMarketSymbol"]
      Local["localStorage: preferences, FX cache, draft fallback"]
      Chart["TradingView embedded chart"]
      CB["CostBasisPanel"]
      UI --> Context
      Context --> SDK
      UI --> FX
      Context --> FX
      UI --> Symbol
      Symbol --> Local
      FX --> Local
      UI --> Chart
      UI --> CB
      CB --> SDK
      Context -. "legacy cache and preferences" .-> Local
    end
    subgraph Next["Next.js 15 server"]
      API["Market / Chart / Analysis route handlers and actions"]
      FXAPI["Exchange-rate valuation API and cache"]
      Gate["Middleware: route access checks"]
    end
    User --> Gate
    Gate --> UI
    UI --> API
    FX --> FXAPI
    subgraph External["External services"]
      Market["Yahoo Finance market endpoints"]
      TV["TradingView"]
      Wise["Wise: only if server token configured"]
      Backup["Frankfurter / ExchangeRate-API fallback"]
    end
    API --> Market
    Chart --> TV
    FXAPI --> Wise
    FXAPI --> Backup
    subgraph Supabase["Supabase"]
      Auth["Auth"]
      Data["Data API and PostgreSQL RPC"]
      DB[("PostgreSQL tables")]
      Rules["Functions / triggers / RLS: definitions in repository"]
      Auth --> Data
      Data --> Rules
      Rules --> DB
    end
    SDK --> Auth
    SDK --> Data
    Note["Deployment / enabled policies / applied migrations not verified live"]
    Note -.-> Supabase
```

## 2. User Flow

```mermaid
flowchart TD
    Start(["เริ่มใช้งาน"]) --> Session{"เข้าสู่ระบบแล้วหรือไม่"}
    Session -- "ยังไม่เข้า" --> Login["เข้าสู่ระบบ / สมัครบัญชี"]
    Login --> Session
    Session -- "เข้าแล้ว" --> Dashboard["Dashboard"]
    Dashboard --> Choice{"ต้องการทำอะไร"}
    Choice --> Portfolio["ดู Portfolio และยอดเงิน"]
    Choice --> Bucket["จัดการ Bucket / เงินสด"]
    Choice --> Journal["ดู Ledger / History / Trade Journal"]
    Choice --> Search["ค้นหาหุ้นใน Terminal หรือ Trade"]
    Search --> Remember["เก็บ symbol ล่าสุดร่วมกันใน browser"]
    Remember --> Terminal["Terminal: กราฟหุ้นที่เลือก"]
    Terminal --> Plan["Trade Plan: symbol เดียวกัน"]
    Plan --> Analyze["ปุ่มวิเคราะห์หุ้น"]
    Analyze --> Terminal
    Plan --> HasPortfolio{"เลือก trading portfolio แล้วหรือไม่"}
    HasPortfolio -- "ยัง" --> Pick["เลือกพอร์ต"] --> HasPortfolio
    HasPortfolio -- "แล้ว" --> Action{"ดำเนินการ"}
    Action --> Draft["เพิ่ม / แก้ draft ไม้ DCA"]
    Draft --> Buy["ระบุราคา จำนวน ค่าธรรมเนียม และบัญชีเงินสด"]
    Buy --> Validate{"ข้อมูลและยอดเงินถูกต้อง"}
    Validate -- "ไม่ผ่าน" --> Buy
    Validate -- "ผ่าน" --> RecordBuy["ยืนยันบันทึก BUY เข้าพอร์ต"]
    RecordBuy --> Position["ดูไม้ที่ถืออยู่และ Live P&L"]
    Action --> Position
    Position --> Mode{"เลือกไม้เอง / เฉลี่ยตามสัดส่วน"}
    Mode --> Preview["ตรวจจำนวนขายและ preview ผลลัพธ์"]
    Preview --> ValidSale{"preview ผ่าน"}
    ValidSale -- "ไม่ผ่าน" --> Position
    ValidSale -- "ผ่าน" --> Confirm["ดู modal และพิมพ์ symbol ยืนยัน"]
    Confirm --> Save["บันทึก SELL ผ่าน RPC"]
    Save --> Result{"สำเร็จหรือไม่"}
    Result -- "ข้อมูลเปลี่ยน / error" --> Preview
    Result -- "สำเร็จ" --> Refresh["โหลดข้อมูลใหม่: หุ้นเหลือ / Realized / เงินสด"]
    Refresh --> Position
    Refresh --> Journal
    Portfolio --> Choice
    Bucket --> Choice
    Journal --> Choice
```

## 3. Class / Domain Model

```mermaid
classDiagram
    direction LR
    class BuyLot {
      <<TypeScriptType>>
      +string id
      +string symbol
      +string date
      +string price
      +string qty
      +string fee
    }
    class SellTransaction {
      <<TypeScriptType>>
      +string id
      +string symbol
      +string date
      +string price
      +string qty
      +string fee
      +Method method
      +Selection[] selections
    }
    class Selection {
      <<ConceptualValueObject>>
      +string lotId
      +string qty
    }
    class Position {
      <<TypeScriptType>>
      +BuyLot buy
      +Decimal remaining
      +Decimal cost
    }
    class LotAllocation {
      <<TypeScriptType>>
      +string sellId
      +string lotId
      +Decimal qtyClosed
      +Decimal costPerShare
      +Decimal cost
      +Decimal sellFee
      +Decimal realizedPnl
    }
    class Ledger {
      <<TypeScriptType>>
      +Position[] lots
      +LotAllocation[] allocations
      +Decimal invested
      +Decimal realized
    }
    class Decimal {
      +from(value) Decimal$
      +add(value) Decimal
      +sub(value) Decimal
      +mul(value) Decimal
      +div(value) Decimal
      +cmp(value) number
      +toFixed(places) string
    }
    class CostBasisModule {
      <<FunctionalModule>>
      +replay(events) Ledger
      +mark(state, market)
      +proportionalCuts(lots, quantity)
      +previewCorrection(events, lotId, patch)
      +assertDeletable(events, lotId)
      +recoverOriginalQty(remaining, closed, complete)
    }
    class NativeMoney {
      <<TypeScriptType>>
      +amount
      +currency
    }
    class FxQuote {
      <<TypeScriptType>>
      +string rate
      +number fetchedAt
      +string source
      +string providerDate
    }
    class FxStore {
      <<FactoryReturnedObject>>
      +getSnapshot()
      +subscribe(listener)
      +start()
      +setManual(rate)
      +resetAuto()
    }
    class FxModule {
      <<FunctionalModule>>
      +convertNativeMoney(money, target, rate)
      +sumNativeMoney(items, target, rate)
      +valuePortfolio(items, currency, rate)
    }
    SellTransaction "1" *-- "0..*" Selection
    Position --> BuyLot
    Ledger "1" *-- "0..*" Position
    Ledger "1" *-- "0..*" LotAllocation
    LotAllocation --> BuyLot : lotId
    LotAllocation --> SellTransaction : sellId
    CostBasisModule ..> Ledger
    CostBasisModule ..> Decimal
    FxModule ..> NativeMoney
    FxModule ..> Decimal
    FxStore --> FxQuote : current quote
```

## 4. ER Diagram

```mermaid
erDiagram
    auth_users {
        uuid id PK
    }
    profiles {
        uuid id PK, FK "required"
        text email "required"
        text full_name "nullable"
        text avatar_url "nullable"
        text language "nullable"
        text currency "nullable"
        boolean email_verified "nullable"
        text account_status "nullable"
        inet registration_ip "nullable"
        text device_fingerprint "nullable"
        text user_agent "nullable"
        timestamptz last_login_at "nullable"
        timestamptz created_at "nullable"
        timestamptz updated_at "nullable"
        text terminal_symbol "nullable"
        text terminal_interval "nullable"
    }
    assets {
        uuid id PK "required"
        uuid user_id FK "required"
        text name "required"
        text symbol "required"
        text asset_type "nullable"
        numeric value_usd "required"
        numeric quantity "nullable"
        numeric avg_purchase_price "nullable"
        numeric current_price "nullable"
        numeric change_24h "nullable"
        numeric change_percentage "nullable"
        numeric allocation_target "nullable"
        numeric allocation_current "nullable"
        text sector "nullable"
        text country "nullable"
        text notes "nullable"
        boolean is_active "nullable"
        timestamptz created_at "nullable"
        timestamptz updated_at "nullable"
        boolean is_favorite "nullable"
        integer sort_order "nullable"
        text allocation "nullable"
        uuid portfolio_id FK "nullable"
        uuid brokerage_account_id FK "nullable"
    }
    trades {
        uuid id PK "required"
        uuid user_id FK "required"
        uuid asset_id FK "nullable"
        text asset_name "required"
        text symbol "required"
        text type "required"
        numeric amount_usd "required"
        numeric quantity "required"
        numeric price_at_execution "required"
        text currency "nullable"
        numeric exchange_rate_at_time "nullable"
        numeric fees "nullable"
        numeric taxes "nullable"
        numeric total_cost "nullable"
        numeric profit_loss "nullable"
        numeric profit_loss_percentage "nullable"
        timestamptz execution_date "nullable"
        timestamptz settlement_date "nullable"
        text status "nullable"
        text notes "nullable"
        array tags "nullable"
        timestamptz created_at "nullable"
        timestamptz updated_at "nullable"
        numeric original_amount "nullable"
        uuid portfolio_id FK "nullable"
        uuid brokerage_account_id FK "nullable"
    }
    allocations {
        uuid id PK "required"
        uuid user_id FK "required"
        text label "required"
        numeric value "nullable"
        text color "nullable"
        timestamptz created_at "nullable"
        timestamptz updated_at "nullable"
        uuid portfolio_id FK "nullable"
    }
    money_buckets {
        uuid id PK "required"
        uuid user_id FK "required"
        text name "required"
        numeric target_percent "nullable"
        numeric current_amount "nullable"
        text color "nullable"
        text icon "nullable"
        boolean linked_to_expenses "nullable"
        timestamptz created_at "nullable"
        timestamptz updated_at "nullable"
        numeric target_amount "nullable"
        varchar currency "required"
        uuid portfolio_id FK "nullable"
    }
    bucket_activities {
        uuid id PK "required"
        uuid user_id FK "required"
        uuid bucket_id FK "nullable"
        text type "required"
        numeric amount "required"
        text note "nullable"
        timestamptz date "required"
        timestamptz created_at "nullable"
        varchar currency "nullable"
        numeric rate_at_time "nullable"
        numeric original_amount "nullable"
        uuid portfolio_id FK "nullable"
        uuid brokerage_entry_id FK "nullable"
    }
    cash_activities {
        uuid id PK "required"
        uuid user_id FK "required"
        text type "required"
        numeric amount "required"
        text category "required"
        text note "nullable"
        timestamptz date "required"
        timestamptz created_at "nullable"
        text time "nullable"
        uuid bucket_id FK "nullable"
        boolean is_transfer "nullable"
        varchar currency "nullable"
        numeric rate_at_time "nullable"
        numeric original_amount "nullable"
        uuid portfolio_id FK "nullable"
        uuid brokerage_entry_id FK "nullable"
        jsonb funding_details "nullable"
    }
    trade_journal {
        uuid id PK "required"
        uuid user_id FK "nullable"
        text symbol "required"
        text market "required"
        text timeframe "required"
        text status "nullable"
        jsonb entries "nullable"
        numeric stop_loss "nullable"
        jsonb take_profits "nullable"
        numeric avg_entry "nullable"
        numeric total_pnl "nullable"
        text notes "nullable"
        timestamptz opened_at "nullable"
        timestamptz closed_at "nullable"
        timestamptz created_at "nullable"
        jsonb signal_data "nullable"
        uuid portfolio_id FK "nullable"
    }
    dca_drafts {
        uuid id PK "required"
        uuid user_id FK "required"
        text symbol "required"
        jsonb entries "required"
        timestamptz updated_at "nullable"
        uuid portfolio_id FK "nullable"
    }
    portfolio_snapshots {
        uuid id PK "required"
        uuid user_id FK "required"
        numeric total_value "required"
        date date "required"
        timestamptz created_at "nullable"
    }
    user_categories {
        uuid id PK "required"
        uuid user_id FK "required"
        varchar type "required"
        varchar label "required"
        varchar icon "required"
        timestamptz created_at "required"
        uuid portfolio_id FK "nullable"
    }
    portfolios {
        uuid id PK "required"
        uuid user_id FK "required"
        text name "required"
        text color "required"
        boolean is_default "required"
        timestamptz created_at "required"
        timestamptz updated_at "required"
        text kind "required"
    }
    history_events {
        uuid id PK "required"
        uuid user_id FK "required"
        uuid portfolio_id "nullable"
        text source_table "required"
        uuid source_record_id "required"
        text action "required"
        text transaction_type "required"
        text asset_symbol "nullable"
        numeric quantity "nullable"
        numeric price "nullable"
        numeric gross_amount "required"
        numeric fees "required"
        numeric taxes "required"
        numeric net_amount "required"
        text currency "nullable"
        numeric exchange_rate "nullable"
        numeric realized_pnl "nullable"
        numeric unrealized_pnl "nullable"
        text category "nullable"
        uuid related_bucket_id "nullable"
        text note "nullable"
        timestamptz occurred_at "required"
        timestamptz recorded_at "required"
        jsonb metadata "required"
    }
    brokerage_accounts {
        uuid id PK "required"
        uuid user_id FK "required"
        uuid portfolio_id FK "required"
        text name "required"
        text broker "nullable"
        text currency "required"
        text color "required"
        timestamptz created_at "required"
        timestamptz updated_at "required"
        text kind "required"
    }
    brokerage_cash_entries {
        uuid id PK "required"
        uuid user_id FK "required"
        uuid portfolio_id FK "required"
        uuid brokerage_account_id FK "required"
        text type "required"
        numeric amount "required"
        text currency "required"
        uuid trade_id FK "nullable"
        timestamptz occurred_at "required"
        text note "nullable"
        timestamptz created_at "required"
    }
    cost_basis_methods {
        uuid user_id PK, FK "required"
        uuid portfolio_id PK, FK "required"
        text symbol PK "required"
        text method "required"
    }
    cost_basis_sales {
        uuid sell_id PK, FK "required"
        uuid user_id FK "required"
        text method "required"
        jsonb selections "required"
        jsonb request "required"
    }
    cost_basis_revisions {
        bigint id PK "required"
        uuid user_id FK "required"
        uuid portfolio_id FK "required"
        text symbol "required"
        text reason "required"
        jsonb snapshot "required"
        timestamptz created_at "required"
    }
    auth_users ||--o| profiles : "id"
    auth_users ||..o{ assets : "user_id"
    portfolios |o..o{ assets : "portfolio_id"
    brokerage_accounts |o..o{ assets : "brokerage_account_id"
    auth_users ||..o{ trades : "user_id"
    assets |o..o{ trades : "asset_id"
    portfolios |o..o{ trades : "portfolio_id"
    brokerage_accounts |o..o{ trades : "brokerage_account_id"
    auth_users ||..o{ allocations : "user_id"
    portfolios |o..o{ allocations : "portfolio_id"
    auth_users ||..o{ money_buckets : "user_id"
    portfolios |o..o{ money_buckets : "portfolio_id"
    auth_users ||..o{ bucket_activities : "user_id"
    money_buckets |o..o{ bucket_activities : "bucket_id"
    portfolios |o..o{ bucket_activities : "portfolio_id"
    brokerage_cash_entries |o..o{ bucket_activities : "brokerage_entry_id"
    auth_users ||..o{ cash_activities : "user_id"
    money_buckets |o..o{ cash_activities : "bucket_id"
    portfolios |o..o{ cash_activities : "portfolio_id"
    brokerage_cash_entries |o..o{ cash_activities : "brokerage_entry_id"
    auth_users |o..o{ trade_journal : "user_id"
    portfolios |o..o{ trade_journal : "portfolio_id"
    auth_users ||..o{ dca_drafts : "user_id"
    portfolios |o..o{ dca_drafts : "portfolio_id"
    auth_users ||..o{ portfolio_snapshots : "user_id"
    auth_users ||..o{ user_categories : "user_id"
    portfolios |o..o{ user_categories : "portfolio_id"
    auth_users ||..o{ portfolios : "user_id"
    auth_users ||..o{ history_events : "user_id"
    auth_users ||..o{ brokerage_accounts : "user_id"
    portfolios ||..o{ brokerage_accounts : "portfolio_id"
    auth_users ||..o{ brokerage_cash_entries : "user_id"
    portfolios ||..o{ brokerage_cash_entries : "portfolio_id"
    brokerage_accounts ||..o{ brokerage_cash_entries : "brokerage_account_id"
    trades |o..o{ brokerage_cash_entries : "trade_id"
    auth_users ||--o{ cost_basis_methods : "user_id"
    portfolios ||--o{ cost_basis_methods : "portfolio_id"
    auth_users ||..o{ cost_basis_sales : "user_id"
    trades ||--o| cost_basis_sales : "sell_id"
    portfolios ||..o{ cost_basis_revisions : "portfolio_id"
    auth_users ||..o{ cost_basis_revisions : "user_id"
```

## 5. Use Case

```mermaid
flowchart LR
    Visitor["Actor: ผู้เยี่ยมชม"]
    Investor["Actor: ผู้ใช้ที่เข้าสู่ระบบ"]
    Auth["External: Supabase Auth"]
    Market["External: ผู้ให้บริการราคาตลาด"]
    FX["External: ผู้ให้บริการ FX"]
    subgraph System["System boundary: FinTrack"]
      SignIn(["สมัคร / เข้าสู่ระบบ"])
      Manage(["จัดการพอร์ตและบัญชีเงินสด"])
      View(["ดูมูลค่าพอร์ตและ P&L"])
      Cash(["บันทึกฝากถอน / รายรับรายจ่าย / โอน"])
      Research(["ค้นหาและวิเคราะห์หุ้น"])
      Plan(["วางแผน DCA"])
      Buy(["บันทึกซื้อหุ้น"])
      Sell(["บันทึกขายบางส่วน / ทั้งหมด"])
      Preview(["ตรวจสอบ preview และยืนยัน symbol"])
      History(["ดูประวัติ / แก้ไขรายการที่อนุญาต"])
      Settings(["เลือกภาษา / สกุลแสดงผล / เรท"])
    end
    Visitor --- SignIn
    Auth --- SignIn
    Investor --- Manage
    Investor --- View
    Investor --- Cash
    Investor --- Research
    Investor --- Plan
    Investor --- Buy
    Investor --- Sell
    Investor --- History
    Investor --- Settings
    Sell -. "include" .-> Preview
    Market --- Research
    Market --- View
    FX --- View
    FX --- Settings
```

## 6. Sequence: เพิ่มรายรับ/รายจ่าย

```mermaid
sequenceDiagram
    autonumber
    actor U as ผู้ใช้
    participant M as AddCashflowModal
    participant C as AppContext
    participant D as db helpers / Supabase SDK
    participant DB as Supabase Data API / PostgreSQL
    U->>M: กรอกประเภท จำนวน สกุล หมวดหมู่ และ Bucket
    M->>M: ตรวจจำนวนและ native currency ให้ตรง Bucket
    alt validation ไม่ผ่าน
        M-->>U: แสดง error และไม่บันทึก
    else validation ผ่าน
        M->>C: addCashActivity(payload)
        C->>C: ตรวจ portfolio และเพิ่ม optimistic row
        C->>D: cashActivities.insert(payload)
        D->>DB: from cash_activities insert select single
        alt insert ล้มเหลว
            DB-->>D: error
            D-->>C: error
            C->>C: ลบ optimistic row
            C-->>M: null
            M-->>U: แสดงข้อผิดพลาด
        else insert สำเร็จ
            DB-->>D: saved row
            D-->>C: saved row
            C->>C: แทน temporary id ด้วย id จริง
            C-->>M: savedActivity
            opt มี Bucket ที่เกี่ยวข้อง
                M->>C: updateMoneyBucket ด้วย native amount
                M->>C: addBucketActivity พร้อม original amount และ currency
                C->>D: UPDATE bucket และ INSERT bucket activity
                D->>DB: requests แยกกัน
                Note over M,DB: เส้นทางนี้ไม่ใช่ atomic transaction เดียวจากโค้ด client
            end
            M-->>U: จบขั้นตอนฟอร์มตามผลที่ client รับ
        end
    end
```

## หมายเหตุการใช้ส่งรายงาน

- ER เป็น physical schema ตามไฟล์ผู้ใช้แนบ ไม่ได้ยืนยัน schema production
- Class เป็น domain types และ functional modules ตามโค้ด ไม่ใช่ ORM entities ที่สร้างขึ้นเอง
- Use Case ใช้ flowchart จำลองเพื่อ compatibility; ตรวจ rubric หากต้องใช้ strict UML
- Sequence เงินสดแสดง optimistic update และหลาย requests ตามโค้ด ไม่อ้างว่า atomic
- ไม่มีหลักฐาน GraphQL หรือ avatar storage implementation ในตัวอย่างที่ตรวจ จึงไม่นำมาวาดเป็น implemented subsystem
- ตาราง LotAllocation ไม่มีใน schema; ไม่เพิ่มเป็น entity ฐานข้อมูล
- ตรวจความอ่านง่ายของ ER หลัง render; ควรแบ่งภาพย่อยเมื่อนำลง A4

