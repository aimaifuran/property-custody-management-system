# VS Code File Map and Defense Notes

Gabay ito para maipaliwanag ang aktuwal na codebase sa defense at mabilis mahanap ang kaugnay na source file. Hindi kailangang isaulo ang bawat linya. Unawain ang daloy: **screen → API request → route/logic → model/database → response → screen/PDF**.

## 1. Maikling paliwanag ng system

Ang Property Accountability Management System ay web application para magtala at sumubaybay ng government supplies at accountable properties. Ang React frontend ang nagpapakita ng forms, tables at reports. Ang Express backend ang tumatanggap ng API requests, nagva-validate ng data at nagpapatupad ng workflow. Ang MongoDB ang nagtatago ng records.

```text
Admin/User browser (React)
        │ HTTP/JSON API + session token
        ▼
Express server (routes, authorization, business rules)
        │ Mongoose
        ▼
MongoDB (users, IAR/RIS, inventory, accountability, reports)
```

Main stack ayon sa README at package files: React, Vite, React Router, TanStack React Query, Axios; Node.js, Express, Mongoose/MongoDB, JWT, bcrypt, Helmet, Validator. PDF/Excel tools at shared exporters ay nasa frontend utilities.

## 2. Paano maghanap ng code sa VS Code

| Gagawin | Shortcut / paraan |
|---|---|
| Buksan ang file ayon sa pangalan | Ctrl+P, i-type ang filename, hal. IarPage.jsx |
| Hanapin ang text/function sa buong project | Ctrl+Shift+F, i-type ang label, API path o function |
| Hanapin sa kasalukuyang file | Ctrl+F |
| Pumunta sa function definition | I-right-click ang function, Go to Definition, o F12 |
| Tingnan kung saan ginagamit | Right-click, Find All References, o Shift+F12 |
| Balikan ang dating cursor location | Alt+Left |

Kapag hinahanap ang feature, magsimula sa UI page at sundan ang API call. Hanapin ang path sa frontend, pagkatapos ang katumbas na route sa backend/src/app.js at backend/src/routes/. Sa route, sundan ang utility at model.

## 3. Mahahalagang file ayon sa bahagi

### Project setup

| File | Bakit mahalaga |
|---|---|
| README.md | Project description, stack, local setup at deployment notes. |
| frontend/package.json | Frontend dependencies at dev/build/lint commands. |
| backend/package.json | Backend dependencies, start/dev, seed at migration scripts. |
| frontend/src/main.jsx | React entry point; dito sini-start ang app. |
| frontend/src/App.jsx | Frontend routes, protected pages at role-based page access. |
| backend/server.js | Server startup, DB connection, initial setup at workflow email polling. |
| backend/src/app.js | Express middleware, API route mounts, health endpoint at error handler. |
| backend/src/config/database.js | MongoDB connection setup. |

### Frontend shared files

| File | Responsibilidad |
|---|---|
| frontend/src/contexts/AuthContext.jsx | Login/session/user state sa frontend. |
| frontend/src/components/Layout.jsx | Navigation/sidebar at application shell. |
| frontend/src/components/SearchInput.jsx | Shared searchable input at suggestions. |
| frontend/src/components/DateInput.jsx | Shared date input/calendar. |
| frontend/src/components/ValidatedForm.jsx | Reusable client-side form validation. |
| frontend/src/components/Pagination.jsx | Paging controls. |
| frontend/src/components/TableScroll.jsx | Horizontal table scrolling. |
| frontend/src/components/SavedReportsHeader.jsx | Shared saved-record/report header. |

### Frontend form pages

| Form/page | UI source |
|---|---|
| IAR | frontend/src/pages/IarPage.jsx |
| RIS | frontend/src/pages/RisPage.jsx |
| ICS | frontend/src/pages/IcsPage.jsx |
| PAR | frontend/src/pages/ParPage.jsx |
| PTR | frontend/src/pages/PtrPage.jsx |
| PRS | frontend/src/pages/PrsPage.jsx |
| Property cards / records | frontend/src/pages/PropertyRecordsPage.jsx, PropertiesPage.jsx |
| Inventory | frontend/src/pages/InventoryPage.jsx |
| Login / dashboard | frontend/src/pages/LoginPage.jsx, DashboardPage.jsx |
| User issued / returned items | frontend/src/pages/MyIssuedItemsPage.jsx, MyReturnsPage.jsx |
| Historical records | frontend/src/pages/HistoricalRecordsPage.jsx |
| Other reports | frontend/src/pages/MonthlyItemsReportPage.jsx, PpeStationReportPage.jsx, AnnualOfficeItemsPage.jsx |

### Backend, security, at data

| File/folder | Responsibilidad |
|---|---|
| backend/src/routes/ | API endpoints, halimbawa iar.js, ris.js, ics.js, par.js, transfers.js (PTR), returns.js (PRS), reports.js. |
| backend/src/middlewares/auth.js | Authentication at access/permission checks. |
| backend/src/middlewares/validateAdminForm.js | Server-side validation para sa admin forms. |
| backend/src/models/ | Mongoose schemas at database collections. |
| InspectionAcceptanceReport.js / RequisitionIssueSlip.js | IAR at RIS data structures. |
| Inventory.js / Item.js | Stock balances at item catalog. |
| PropertyCard.js / LedgerTransaction.js | Property history at stock movement ledger. |
| PropertyAccountability.js | Accountable property/custodian links. |
| InventoryCustodianSlip.js / PropertyAcknowledgementReceipt.js | ICS at PAR records. |
| PropertyTransferReport.js / PropertyReturnSlip.js | PTR at PRS records. |

Models ay nasa backend/src/models/ kahit pinaikli ang path sa table sa itaas.

### Shared workflow logic

| File | Bakit mahalaga |
|---|---|
| backend/src/utils/issueRis.js | RIS issuance at stock/accountability workflow. |
| backend/src/utils/postPropertyReturn.js | Pag-post/pagkumpirma ng return workflow. |
| backend/src/utils/recordAccountReturn.js | Return movement laban sa account/item. |
| backend/src/utils/itemPropertyLedger.js | Item/property movement ledger operations. |
| backend/src/utils/documentNumber.js | Server document-number sequence logic. |
| backend/src/utils/validateRequestedStock.js | Validation ng stock at quantity. |
| backend/src/utils/bootstrapSeed.js | Initial app/bootstrap setup. |
| backend/src/utils/workflowEmails.js | Queued workflow-email delivery. |
| backend/src/config/formSignatories.json | Form signatory configuration. |

### Frontend calculations/PDF

Tingnan ang frontend/src/utils/ para sa reusable logic:

- formNumbers.js, formDates.js, formAmounts.js: shared number, date at amount formatting/conversion.
- iarFormData.js, iarItemSelection.js, iarRequisition.js: IAR data at item selection.
- risItemSelection.js: RIS item selection.
- formValidation.js: client-side validation helpers.
- exportOfficialFormPdf.js, templatePdfLayout.js, formPdfStyle.js: PDF export/layout.
- historicalFormPdf.js, risPdf.js, annualOfficePdf.js: specialized PDF output.
- useDocumentNumberPreview.js: preview ng document number; hindi ibig sabihin na reserved na iyon bilang final number.

## 4. Mga workflow na ipapaliwanag sa panel

### IAR receipt

IAR screen: frontend/src/pages/IarPage.jsx → API mount: backend/src/app.js → handler: backend/src/routes/iar.js → schema: backend/src/models/InspectionAcceptanceReport.js at mga kaugnay na Inventory, LedgerTransaction, PropertyCard models/utilities.

Kapag tumingin sa code, ipakita kung saan nagse-save ang frontend, kung saan vina-validate ng backend, at aling models ang tumatanggap ng data. Ang IAR receipt ay source ng received stock at kaugnay na history/draft records.

**Current numbering rule:** PO/JO No. ang purchase/order reference. Hiwalay dito ang IAR No.; optional ito, mano-manong inilalagay at puwedeng blanko. Hindi ito auto-assigned. Kapag may value, 3–4 digits ito at duplicate values ay tinatanggihan.

### RIS issue

RIS screen: frontend/src/pages/RisPage.jsx → backend/src/routes/ris.js → backend/src/utils/issueRis.js → RequisitionIssueSlip, Inventory at PropertyAccountability models.

Ipaliwanag ang pagkakaiba: ang requested quantity ang hinihingi; ang actual issued quantity ang tunay na inilabas. Ang posted issue workflow ang nagtatala ng aktuwal na galaw ng stock at accountability.

### Return, transfer, property history

- Return: PrsPage.jsx → backend/src/routes/returns.js → postPropertyReturn.js / recordAccountReturn.js.
- Transfer: PtrPage.jsx → backend/src/routes/transfers.js → transfer/accountability utilities.
- Property history: PropertyRecordsPage.jsx → propertyCards.js / properties.js routes → PropertyCard model at ledger utilities.
- Reports: report pages → backend/src/routes/reports.js o report-specific routes.

Ihiwalay sa paliwanag ang standalone form na dokumento lang at ang linked transaction na may validated item/account reference at nagtatala ng movement.

## 5. Mga tanong ng panel at files na bubuksan

| Tanong | Maikling sagot | Mga file |
|---|---|---|
| Anong tech stack? | React frontend, Node/Express API, MongoDB gamit ang Mongoose. | README.md, frontend/package.json, backend/package.json |
| Saan nagsisimula ang app? | main.jsx ang React entry point; server.js ang backend entry point. | frontend/src/main.jsx, backend/server.js |
| Saan routes? | Frontend pages at backend API routes ay magkahiwalay. | frontend/src/App.jsx, backend/src/app.js |
| Paano ang login? | Sinusuri ng backend ang credentials at gumagawa ng authenticated session/token. | LoginPage.jsx, AuthContext.jsx, backend/src/routes/auth.js, User.js, auth.js |
| Paano pinoprotektahan ang password? | Backend hashing/verification gamit ang bcrypt; hindi raw password ang dapat itago. | backend/src/routes/auth.js, backend/src/models/User.js |
| Authentication vs authorization? | Authentication: sino ang user. Authorization: ano ang pinapayagang gawin niya. | backend/src/middlewares/auth.js, App.jsx, route files |
| Saan naka-save ang data? | MongoDB collections na inilalarawan ng Mongoose schemas. | backend/src/config/database.js, backend/src/models/ |
| Paano nase-secure ang API? | Backend middleware at route permission checks; hindi frontend route hiding lang. | backend/src/middlewares/auth.js, backend/src/app.js, relevant route |
| Ano nangyayari sa pag-issue ng stock? | Itinatala ang aktuwal na issue at ina-update ang kaugnay na stock/accountability workflow. | ris.js, issueRis.js, Inventory.js, PropertyAccountability.js |
| Paano ang return? | Iniuugnay ang return sa account at eksaktong issued item bago itala ang movement. | PrsPage.jsx, returns.js, postPropertyReturn.js, recordAccountReturn.js |
| Required/automatic ba ang IAR No.? | Hindi. Optional at manual; valid ang blank. Hiwalay ito sa PO/JO No. | IarPage.jsx, InspectionAcceptanceReport.js, routes/iar.js, docs/custody-workflow.md |
| Paano ang document numbers? | Server-side sequence ang nagbibigay ng final number sa applicable forms; preview ay hindi reservation. | documentNumber.js, DocumentSequence.js, docs/custody-workflow.md |
| Bakit transaction ang database? | Dapat magkakasabay mag-commit ang magkakaugnay na pagbabago, o maibalik kung pumalya ang operation. | Hanapin ang startSession / withTransaction sa backend/src/routes at utils |
| Paano patakbuhin? | Mag-install at magpatakbo ng frontend at backend nang magkahiwalay; kailangan ng tamang MongoDB configuration. | README.md, package.json files |

## 6. Commands para patakbuhin locally

Sa magkahiwalay na VS Code terminals:

```powershell
# Terminal 1
cd backend
npm install
npm run dev

# Terminal 2
cd frontend
npm install
npm run dev
```

Available din ang frontend npm run build at npm run lint. May backend seed scripts at npm run migrate:iar-number-index; patakbuhin lang ang migration kung kailangan sa target database at sundin ang docs/custody-workflow.md. Kailangan ng replica-set capable MongoDB (hal. Atlas o local replica set) para sa transaction workflows.

## 7. Maikling script sa defense

> “Our system digitizes the recording and monitoring of supplies and accountable properties. The React interface communicates with a Node.js and Express API. The backend validates permissions and business rules, then stores related records in MongoDB through Mongoose. Its workflows connect receipt, inventory, issuance, accountability, return, transfer, and reports so administrators can trace the supporting record for an item movement.”

Kapag tinanong kung saan ipinatupad ang feature:

> “The page is in frontend/src/pages. I’ll follow its API request to the route mounted in backend/src/app.js, then show the route, shared workflow utility, and Mongoose model responsible for that data.”

Kung hindi sigurado sa isang detalye, sabihin na susundan mo ang UI, API route at model para makumpirma ang eksaktong behavior bago sumagot.

## 8. Paalala para tama ang sagot

- Huwag sabihing auto-number o required ang IAR No. Optional ito at manual; blanko ay valid.
- Ihiwalay ang PO/JO No., IAR No., RIS No., Property No. at Stock No.; magkakaibang reference ang mga ito.
- Huwag sabihing lahat ng saved forms ay nagbabago ng stock. Tukuyin kung standalone document o linked transaction.
- Huwag sabihing frontend lang ang security; ipinapatupad din ng backend ang authentication at authorization.
- Kapag feature-specific ang tanong, ipakita ang UI at backend code. Hindi sapat ang field label lang para patunayang ganoon din ang saving behavior.
- Ang backend/vercel-seed.js ay deployment/bootstrap seed logic; hindi ito ang pangunahing implementation ng araw-araw na IAR/RIS workflow.

## 9. Iba pang gabay

- [System Defense Guide](SYSTEM-DEFENSE-GUIDE.md) — presentation flow, forms, demo at Q&A.
- [Defense Presentation Explanation](DEFENSE-PRESENTATION-EXPLANATION.md) — paliwanag ng forms at computations.
- [Custody Workflow](custody-workflow.md) — kasalukuyang stock, issue, transfer, return at numbering rules.
- [Form Computations](form-computations.md) — paliwanag sa computations.
- [User Manual source](../frontend/src/pages/UserManualPage.jsx) — instructions na ipinapakita sa app.
