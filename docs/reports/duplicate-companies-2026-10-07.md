# Duplicate companies, tenant 1, 2026-10-07

Read-only report from `web/scripts/duplicate-companies.mjs`. Live companies only (soft-deleted excluded).
Survivor = most linked records (contacts + leads + deals + tasks), then oldest. Split = more than one member owns leads or deals.
VAT CONFLICT = members carry different VAT cores, so they are likely distinct legal entities; verify before any merge.

| Method | Groups | Split groups | VAT conflict groups |
|---|---|---|---|
| vat | 3 | 0 | 0 |
| key | 6 | 0 | 4 |
| domain | 0 | 0 | 0 |

Distinct companies involved: 16

## By vat (3)

### 11630364, survivor 10, linked 2

| id | name | status | account_type | VAT | website | created | contacts | leads | deals | tasks | notes len |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 10 | BARANYAI JENŐ | active | Customer | 11630364222 |  | 2026-05-11 | 1 | 0 | 0 | 0 | 0 |
| 26 | ESZ-SZER-GÉP KFT. | active | Customer | 11630364211 |  | 2026-05-11 | 1 | 0 | 0 | 0 | 0 |

### 25480423, survivor 1216, linked 2

| id | name | status | account_type | VAT | website | created | contacts | leads | deals | tasks | notes len |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1216 | GLOBAL NDT KFT. | active | Competitor | 25480423213 |  | 2026-05-11 | 1 | 0 | 0 | 0 | 0 |
| 1702 | NDT GLOBAL KFT. | active |  | 25480423-2-13 |  | 2026-06-10 | 1 | 0 | 0 | 0 | 0 |

### 11161154, survivor 299, linked 0

| id | name | status | account_type | VAT | website | created | contacts | leads | deals | tasks | notes len |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 299 | MIAS HUNGARY KFT. | active | Prospect | 11161154242 |  | 2026-05-11 | 0 | 0 | 0 | 0 | 0 |
| 1445 | MIAS HUNGARY KFT. | active | Prospect | 11161154210 |  | 2026-05-11 | 0 | 0 | 0 | 0 | 0 |

## By key (6)

### controllabor, survivor 1209, linked 13

| id | name | status | account_type | VAT | website | created | contacts | leads | deals | tasks | notes len |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1209 | CONTROL LABOR KFT. | active | Control Labor Kft. | 23075061243 |  | 2026-05-11 | 8 | 0 | 0 | 0 | 0 |
| 1707 | controllabor |  | Lead |  |  | 2026-09-07 | 1 | 1 | 0 | 3 | 0 |

### siadmacchineimpiantispa (VAT CONFLICT), survivor 1319, linked 2

| id | name | status | account_type | VAT | website | created | contacts | leads | deals | tasks | notes len |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1319 | SIAD MACCHINE IMPIANTI S.P.A. | active | Customer | IT00209070168 |  | 2026-05-11 | 2 | 0 | 0 | 0 | 0 |
| 99 | SIAD MACCHINE IMPIANTI S.P.A. | active | Customer | IT00228420162 |  | 2026-05-11 | 0 | 0 | 0 | 0 | 0 |

### engelhungaria (VAT CONFLICT), survivor 633, linked 1

| id | name | status | account_type | VAT | website | created | contacts | leads | deals | tasks | notes len |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 633 | ENGEL HUNGÁRIA KFT. | active | Prospect | 11770790208 |  | 2026-05-11 | 1 | 0 | 0 | 0 | 0 |
| 423 | ENGEL-HUNGÁRIA KFT. | active | Prospect | 11771148241 |  | 2026-05-11 | 0 | 0 | 0 | 0 | 0 |

### femalk (VAT CONFLICT), survivor 207, linked 0

| id | name | status | account_type | VAT | website | created | contacts | leads | deals | tasks | notes len |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 207 | FÉMALK ZRT. | active | Prospect | 12963409244 |  | 2026-05-11 | 0 | 0 | 0 | 0 | 0 |
| 580 | FÉM-ALK KFT. | active | Prospect | 14122282242 |  | 2026-05-11 | 0 | 0 | 0 | 0 | 0 |

### fovill (VAT CONFLICT), survivor 934, linked 0

| id | name | status | account_type | VAT | website | created | contacts | leads | deals | tasks | notes len |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 934 | FO-VILL KFT. | active | Prospect | 24716448213 |  | 2026-05-11 | 0 | 0 | 0 | 0 | 0 |
| 1578 | FO-VILL KFT. | active | Prospect | 10322480213 |  | 2026-05-11 | 0 | 0 | 0 | 0 | 0 |

### miashungary, survivor 299, linked 0

| id | name | status | account_type | VAT | website | created | contacts | leads | deals | tasks | notes len |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 299 | MIAS HUNGARY KFT. | active | Prospect | 11161154242 |  | 2026-05-11 | 0 | 0 | 0 | 0 | 0 |
| 1445 | MIAS HUNGARY KFT. | active | Prospect | 11161154210 |  | 2026-05-11 | 0 | 0 | 0 | 0 | 0 |

## By domain (0)

Scanned 1700 live companies: 1692 with a usable VAT, 0 with a usable website domain.
