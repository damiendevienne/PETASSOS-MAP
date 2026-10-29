# Petassos Travel Map — Screen-by-screen UI contract

**Purpose:** deterministic interface contract derived from the current Petassos specification plus the latest clarifications made in conversation.

**Legend**
- **LOCKED** — explicitly defined and should be implemented as written.
- **PROPOSED** — a concrete layout choice that follows the specification but is not yet explicitly approved.
- **OPEN** — the current specification does not define this precisely enough.

The Markdown functional specification remains authoritative for business rules. This UI contract is intended to expose gaps in page organisation, component placement and interaction.

**Readability:** keep interface text at 13 CSS pixels or larger, following the accepted wireframe scale.

---

# 0. Global application shell

## 0.1 Admin desktop shell

| Region | Element | Position | State / visibility | Behaviour | Status |
|---|---|---|---|---|---|
| Header | Petassos Travel branding | top-left | always visible while authenticated | branding | LOCKED |
| Header | `Map administration` context | immediately right of branding | always visible | identifies Admin mode | LOCKED |
| Header | `Share map with client` | top-right, immediately left of Admin | visible on desktop | opens create-shared-map workflow | LOCKED |
| Header | `Admin ▾` | far top-right | always visible | opens Admin menu | LOCKED |
| Admin menu | `Manage categories` | dropdown item | on menu open | opens category management | LOCKED |
| Admin menu | `Shared maps` | dropdown item | on menu open | opens shared-map management | LOCKED |
| Admin menu | `Import CSV` | dropdown item | on menu open | opens CSV import | LOCKED |
| Admin menu | `Log out` | dropdown item | on menu open | invalidates session and returns to login | LOCKED |
| Main map | MapLibre map | entire viewport below header | always present in normal map modes | pan, zoom, select map objects | LOCKED |
| Work panel | responsive left block | left side over map | visible in Places / Notes / Zones | contains active-tab controls and list | LOCKED |
| Work panel | `Places | Notes | Zones` | top of left block | always visible in normal map modes | switches mode without page reload | LOCKED |
| Map overlay | geographic search | floating directly on map | visible in normal Admin map modes | geocoding only | LOCKED |

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ PETASSOS TRAVEL | Map administration      [Share map with client] [Admin ▾]│
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌───────────────────────┐                                                   │
│ │ Places | Notes | Zones│                                                   │
│ │                       │                                                   │
│ │ active work panel     │                    MAP                            │
│ │                       │                                                   │
│ └───────────────────────┘                                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

`Import CSV` is **not** a left-panel tab.

## 0.2 Admin mobile shell

| Region | Element | Position | State / visibility | Behaviour | Status |
|---|---|---|---|---|---|
| Header | Petassos branding | top-left | always visible | branding | LOCKED |
| Header | hamburger/Admin control | top-right | always visible | opens Admin menu | LOCKED |
| Header | `Share map with client` | not necessarily persistent | accessible through menu flow | opens sharing workflow | LOCKED |
| Map | full-screen map | behind overlays | always present in normal map modes | pan/zoom/select | LOCKED |
| Bottom sheet | work panel | bottom | responsive/draggable | contains Places / Notes / Zones UI | LOCKED |
| Bottom sheet | drag handle | top of sheet | visible | indicates sheet can be dragged | LOCKED (user clarification) |
| Bottom sheet | `Places`, `Notes`, `Zones` | stacked vertically, one per row | visible | switches active mode | LOCKED (user clarification) |
| Map overlay | geographic search | floating on map | visible | geocoding only | LOCKED |

**OPEN:** exact mobile heights/breakpoints for collapsed, intermediate and expanded Admin sheet.

---

# 1. Admin login

| Region | Element | Position | State / visibility | Behaviour | Status |
|---|---|---|---|---|---|
| Page | login surface | full viewport | unauthenticated only | no Admin data behind it | LOCKED |
| Form | username | central login form | required | submit to login | LOCKED |
| Form | password | central login form | required | masked | LOCKED |
| Form | login action | below fields | visible | success enters `/admin` | LOCKED |
| Error | invalid credentials | near form | after failure | generic error | PROPOSED |

**OPEN:** exact placement of login card, logo and error text.

---

# 2. Admin — Places mode

| Region | Element | Position | State / visibility | Behaviour | Status |
|---|---|---|---|---|---|
| Left panel | `Places` tab | top | active | current mode | LOCKED |
| Left panel | `MAP ADMINISTRATION` overline | below `Places | Notes | Zones` selector | absent | omit this text | LOCKED (user clarification) |
| Left panel | three-dot overflow button | beside Places/Notes/Zones title | absent | no undefined menu control | LOCKED (user clarification) |
| Left panel | PLACE search | below tabs | visible | searches all loaded PLACE names, not viewport only | LOCKED |
| Left panel | publication filter | near list controls | visible | `All / Published / Draft` | LOCKED |
| Left panel | `Show all` | compact action | visible | fitBounds to all matching PLACE markers | LOCKED |
| Left panel | `Add a new place` | persistent action | visible | enters choose-position flow | LOCKED |
| Left panel | `PLACES IN CURRENT VIEW (N)` | above list | visible | count updates after map `moveend` | LOCKED |
| Left panel | PLACE cards | scrolling/virtualized list | visible | current viewport + active filters only; clicking a card opens the shared PLACE editor populated with that record | LOCKED (user clarification) |
| Map | PLACE markers | map | visible based on filters | click selects PLACE and highlights its list card; does not open the editor | LOCKED (user clarification) |
| Map overlay | map visibility panel | floating on the right side of the map | visible in Places, Notes and Zones modes | category checkbox per PLACE category; changes PLACE markers/list. A separate Notes checkbox shows/hides NOTE markers | LOCKED (user clarification) |
| Map overlay | geographic search | floating separately on map | visible | pans/zooms to geographic result only | LOCKED |

## 2.1 Category visibility panel

| Element | State | Behaviour | Status |
|---|---|---|---|
| one checkbox per current category | checked by default unless retained state says otherwise | checked = markers/list records shown | LOCKED |
| category colour | displayed when practical | mirrors category definition | LOCKED |
| category Maki icon | displayed when practical | mirrors category definition | LOCKED |
| checkbox change | immediate | updates map and current-view list | LOCKED |
| category editing controls | absent | category management is elsewhere | LOCKED |

The right-side map visibility panel remains present across Places, Notes and Zones. On mobile it sits above the bottom sheet and uses a compact grid for category checkboxes.

**OPEN:** exact internal order of search, publication filter, Show all, Add place and current-view heading.

---

# 3. Admin — Add PLACE

| Region | Element | Position / state | Behaviour | Status |
|---|---|---|---|---|
| Left panel | add-place instruction | replaces or overlays normal list | asks Admin to choose position | LOCKED concept, OPEN exact layout |
| Map | placement mode | active after `Add a new place` | next click/tap defines coordinates | LOCKED |
| Left panel / editor | PLACE form | opens after position chosen | same underlying form as edit | LOCKED |
| PLACE form | Latitude / Longitude | compact, visually secondary fields | editable for fine-tuning or direct coordinate entry | LOCKED |
| Map | remains visible | throughout workflow | supports context and marker movement | LOCKED |

**OPEN:** whether the choose-position instruction is a banner, panel state or short modal.

---

# 4. Admin — Edit PLACE

| Region | Element | Position | State / behaviour | Status |
|---|---|---|---|---|
| Work panel | Name | form | required | LOCKED |
| Work panel | Category | form | single-select, exactly one | LOCKED |
| Work panel | Description | form | optional | LOCKED |
| Work panel | Author (optional) | after Latitude / Longitude and immediately before the Displayed/Published control | optional | LOCKED (user clarification) |
| Work panel | Images | form | zero/many; preview/delete/caption | LOCKED |
| Work panel | Latitude / Longitude | compact, visually secondary form fields | editable/displayed | LOCKED |
| Work panel | Published | form | Draft / Published control | LOCKED |
| Work panel | Delete | form action | confirmation required | LOCKED |
| Work panel | Cancel | form action | restores original data and position | LOCKED |
| Work panel | Save | primary action | saves and returns to list with PLACE selected | LOCKED |
| Map | selected marker | visible | draggable | LOCKED |

**OPEN:** exact field grouping/order and Delete placement.

---

# 5. Admin — Notes mode

| Region | Element | Position | State / visibility | Behaviour | Status |
|---|---|---|---|---|---|
| Left panel | `Notes` tab | top | active | switches work mode | LOCKED |
| Left panel | NOTE search | below tabs | visible | searches all NOTE names/titles globally | LOCKED |
| Left panel | `Add NOTE` | persistent action | visible | starts NOTE placement | LOCKED |
| Left panel | `NOTES IN CURRENT VIEW (N)` | above list | visible | updates after `moveend` | LOCKED |
| Left panel | NOTE cards | current-view list | visible | NOTE-only list | LOCKED |
| Map | NOTE markers | map | visible | distinct NOTE marker | LOCKED |
| Category panel | visible | every Admin map mode | PLACE category controls remain available; NOTE has its own visibility checkbox | LOCKED (user clarification) |
| Publication filter | hidden | Notes mode | absent | Notes cannot be published | LOCKED |
| Map | PLACE markers | visible but dimmed | remain clickable; clicking one switches to Places mode and selects that PLACE | LOCKED (user clarification) |
| Notes panel | dimmed-marker instructional hint | absent | do not explain marker behavior with a helper message | LOCKED (user clarification) |

---

# 6. Admin — Add/Edit NOTE

| Region | Element | Position | State / behaviour | Status |
|---|---|---|---|---|
| Work panel | Name/title | form | required | LOCKED |
| Work panel | Description | form | optional | LOCKED |
| Work panel | Author | form | optional | LOCKED |
| Work panel | Images | form | optional | LOCKED |
| Work panel | Coordinates | form | required | LOCKED |
| Work panel | `Internal note - never shared` | visible notice | always shown | LOCKED |
| Work panel | Category | absent | never shown | LOCKED |
| Work panel | Published | absent | never shown | LOCKED |
| Work panel | NOTE styling | cream/yellow tint + NOTE badge | visible | distinguishes NOTE editor | LOCKED |
| Map | NOTE marker | selected/editable | draggable | LOCKED |

---

# 7. Admin — Zones mode

| Region | Element | Position | State / visibility | Behaviour | Status |
|---|---|---|---|---|---|
| Left panel | `Zones` tab | top | active | zone-management mode | LOCKED |
| Left panel | zone list | below tabs | all saved zones, independent of current map viewport | label the list “All saved zones”; show count and make scope explicit | LOCKED (user clarification) |
| Zone geometry | numeric coordinates/bounds | not required in the interface | Admin views and edits rectangles on the map | LOCKED |
| Left panel | zone search | in zone panel | when useful | filters/finds zones | OPEN whether mandatory |
| Left panel | `New zone` | prominent action | visible | starts rectangle creation | LOCKED |
| Left panel | Edit | per selected/list zone | where editable | opens edit mode | LOCKED |
| Left panel | Delete | per zone where allowed | may be disabled/absent | follows deletion rules | LOCKED |
| Map | zone rectangles | map | outlines are rendered for all saved zones; only those in the current viewport are visible; selecting a list row focuses and highlights that zone | LOCKED (user clarification) |
| Map | selected zone | highlighted rectangle | one selected | map may centre/fit | LOCKED |
| Map | PLACE and NOTE markers | visible but dimmed | remain clickable; clicking switches to the matching Places or Notes mode and selects that record | LOCKED (user clarification) |
| Zones panel | dimmed-marker instructional hint | absent | do not explain marker behavior with a helper message | LOCKED (user clarification) |

## 7.1 Delete-zone behavior

| Zone state | Delete behaviour | User feedback | Status |
|---|---|---|---|
| unused | allowed after confirmation | confirmation | LOCKED |
| used by ≥1 shared map | **blocked** | explains it is used and shared maps must be edited first | LOCKED |
| future non-editable/predefined | capability-driven | based on `can_delete` | LOCKED architecture |

Backend must enforce the referenced-zone deletion block.

---

# 8. Admin — Create zone

| Region | Element | Position / state | Behaviour | Status |
|---|---|---|---|---|
| Map | rectangle drawing mode | active | Admin draws rectangle | LOCKED |
| Work panel | Zone name | form | mandatory | LOCKED |
| Work panel | Save | action | persists zone | LOCKED |
| Work panel | Cancel | action | abandons creation | PROPOSED |
| Return context | from Zones tab | after Save | return to Zones management | LOCKED |
| Return context | from Share workflow | after Save | return to zone selection + auto-select new zone | LOCKED |

Must reuse one Create-zone implementation.

---

# 9. Admin — Edit zone

| Region | Element | Position / state | Behaviour | Status |
|---|---|---|---|---|
| Map | selected rectangle | editable | move/resize | LOCKED |
| Work panel | Zone name | editable | rename | LOCKED |
| Work panel | usage count | contextual info | `used_by_count` | PROPOSED |
| Save on unused zone | normal | save | LOCKED |
| Save geometry on used zone | confirmation required | warn linked shared maps change immediately | LOCKED |
| Rename used zone | allowed | Admin-facing name only | LOCKED |
| Delete used zone | blocked | explanatory message | LOCKED |

**OPEN:** exact placement/style of the used-zone warning.

---

# 10. Admin — Manage categories

Entry point: **`Admin ▾ -> Manage categories`**.

| Region | Element | Position / state | Behaviour | Status |
|---|---|---|---|---|
| Header | standard Admin header | visible | keeps Admin context | LOCKED |
| Main interface | category list | management surface | lists all categories | LOCKED |
| Category editor | Name | editable | unique case-insensitively | LOCKED |
| Category editor | Maki icon | editable | choose supported icon | LOCKED |
| Category editor | Colour | editable | updates markers everywhere | LOCKED |
| Category editor | Add category | action | creates category | LOCKED |
| Category editor | Delete | action | blocked if referenced | LOCKED |
| Map | absent from the management surface | category editor is a dedicated Admin page | LOCKED (user clarification) |
| Navigation container | dedicated Admin page | standard header and neutral management surface | LOCKED (user clarification) |

This is a major remaining page-organisation ambiguity.

---

# 11. Admin — Shared maps list

Entry point: **`Admin ▾ -> Shared maps`**.

| Region | Element | Position / state | Behaviour | Status |
|---|---|---|---|---|
| Header | standard Admin header | visible | Admin context | LOCKED |
| List | non-archived shared maps | default view | Active and Expired | LOCKED |
| Row | internal name | visible | Admin-only identifier | LOCKED |
| Row | public title | visible if useful | traveller-facing title | LOCKED |
| Row | zones | visible | selected zone names | LOCKED |
| Row | allowed categories | visible | category set | LOCKED |
| Row | valid until | visible | local display | LOCKED |
| Row | status | visible | Active / Expired | LOCKED |
| Row | Copy link | action | copies stable URL | LOCKED |
| Row | Edit | action | opens edit workflow | LOCKED |
| Row | Archive | action | archives without token change | LOCKED |
| Filter/tab | Archived | secondary view | shows archived maps | LOCKED |
| Archived row | Unarchive | action | restores non-archived state | LOCKED |
| Map | absent from the management surface | shared maps use a dedicated Admin page | LOCKED (user clarification) |
| Navigation container | dedicated Admin page | standard header and neutral management surface | LOCKED (user clarification) |

---

# 12. Admin — Create/Edit shared map

The specification explicitly says this is a dedicated interface that **keeps the map visible**. The user clarified that the full-page workflow should feel like the other Administration pages: white Admin header, light neutral background and centered content surface. Keep the map in a bounded panel inside the page beside the configuration form; it must not fill the viewport as a background.

| Region | Element | Position / state | Behaviour | Status |
|---|---|---|---|---|
| Header | standard Admin header | visible | Admin context | LOCKED |
| Config panel | Internal name | required | Admin-only | LOCKED |
| Config panel | Public title | required | traveller-visible | LOCKED |
| Config panel | Expiry | required for creation | future date/time | LOCKED |
| Config panel | Allowed categories | checklist/selection | at least one | LOCKED |
| Config panel | Zones | selection UI | at least one | LOCKED |
| Config panel | `New zone` | within zone-selection flow | launches shared Create-zone implementation | LOCKED |
| Map | PLACE markers | visible | configuration context | LOCKED |
| Map | NOTES | hidden | never displayed | LOCKED |
| Map | selected zone rectangles | visible | one or many | LOCKED |
| Map | candidate markers inside zones | prominent | live update | LOCKED |
| Map | markers outside zones | may be de-emphasized | visual aid only | LOCKED option |
| Preview | separate visitor preview | absent | explicitly do not create one | LOCKED |

## 12.1 Zone selection

| Element | Behaviour | Status |
|---|---|---|
| zone checkbox list | check = include zone + show rectangle | LOCKED |
| click zone name | may centre map without toggling | LOCKED |
| several zones | all selected rectangles visible | LOCKED |
| camera | fitBounds to smallest bbox containing selected rectangles | LOCKED |
| access geometry | union of selected rectangles only | LOCKED |

**OPEN:** exact panel/map split and exact internal grouping of fields.

---

# 13. Admin — Import CSV

Entry point: **`Admin ▾ -> Import CSV`**.

| Stage | Element | Behaviour | Status |
|---|---|---|---|
| Upload | file chooser/drop target | accepts CSV | LOCKED concept |
| Validation | preview | validates required fields/category/coordinates | LOCKED |
| Validation | valid-row count | shown | LOCKED |
| Validation | row-level errors | shown | LOCKED |
| Confirmation | import valid rows | inserts valid new PLACE records | LOCKED |
| Existing records | no update/merge | import always creates | LOCKED |
| Unknown category | error | never auto-create | LOCKED |
| Images | unsupported | no image import | LOCKED |

Import CSV is a dedicated Admin page with the standard header and neutral management surface. The map is not retained. **LOCKED (user clarification)**

---

# 14. Traveller — Desktop/tablet

| Region | Element | Position | State / visibility | Behaviour | Status |
|---|---|---|---|---|---|
| Map | full-screen map | whole viewport | always | authorised PLACE only | LOCKED |
| Overlay/header | Petassos identity | top area | visible | branding | LOCKED |
| Header | public title | directly below the Petassos logo | visible | shared-map title | LOCKED (user clarification) |
| Map overlay | geographic search | floating on map | visible | geographic search only | LOCKED |
| Map overlay | authorised category filters | floating control | visible | allowed categories only; all visible initially | LOCKED |
| Map | traveller current position | distinct dot with accuracy halo and recenter control | visible when browser location is available; control requests/centres on device location | LOCKED (user clarification) |
| Side list | current-view PLACE list | floating panel on the left | desktop/tablet | current viewport only | LOCKED (user clarification) |
| Side list | Petassos place search | inside list panel | visible | searches all authorised PLACE globally | LOCKED |
| Map | authorised markers | visible | server-side shared visibility rules | LOCKED |
| Unauthorized data | absent | never discoverable | no NOTES/drafts/outside zones/unauthorized categories | LOCKED |

**OPEN:** exact side and width of traveller list panel.

**OPEN:** exact positions of category filters vs geographic search.

---

# 15. Traveller — Mobile

| Region | Element | Position | State / visibility | Behaviour | Status |
|---|---|---|---|---|---|
| Map | full-screen map | background | always | authorised markers | LOCKED |
| Header | Petassos logo with public title directly below | top | visible | brand and map context | LOCKED (user clarification) |
| Map overlay | geographic search | floating | visible | geography only | LOCKED |
| Map overlay | authorised category filters | compact/floating | visible | toggle allowed categories | LOCKED |
| Bottom sheet | handle | top of sheet | visible in collapsed state | drag | LOCKED |
| Bottom sheet | collapsed | bottom | may show only handle | maximises map | LOCKED |
| Bottom sheet | open browsing state | bottom; leaves about the upper third of the map visible | several places | map remains visible | LOCKED (user clarification) |
| Bottom sheet | expanded | most of screen | full list browsing | LOCKED |
| Bottom sheet | Petassos search | inside list interface | visible when appropriate | all authorised places | LOCKED |
| Bottom sheet | current-view list | inside sheet | updates after movement | LOCKED |

**OPEN:** exact sheet heights.

---

# 16. Traveller — PLACE selected / detail

| Trigger | Result | Status |
|---|---|---|
| tap marker | select marker + highlight/reveal list card | LOCKED |
| tap list card | select marker + gently centre map | LOCKED |
| select Petassos search result | select + move map + update list + highlight | LOCKED |
| open PLACE detail | show name, category, author if present, images, captions, description | LOCKED |
| desktop/tablet detail container | panel opens from the left and replaces the left-side list; close returns to list | LOCKED (user clarification) |
| mobile detail container | bottom sheet rises from the bottom, initially leaving about the upper third of the map visible | LOCKED (user clarification) |

---

# 17. Traveller — invalid shared-link states

| Link state | Backend state | UI requirement | Status |
|---|---|---|---|
| unknown token | 404 | unavailable/not-found state, no data leak | backend LOCKED; exact UI OPEN |
| expired | 410 | expired-link state | backend LOCKED; exact UI OPEN |
| archived | 410 | unavailable state | backend LOCKED; exact UI OPEN |
| active | 200 | normal traveller map | LOCKED |

---

# 18. Cross-screen state rules

| Event | Required UI consequence | Status |
|---|---|---|
| switch Places -> Notes -> Zones | map remains; active work panel changes without reload | LOCKED |
| click dimmed PLACE marker in Notes mode | switch to Places mode and select that PLACE | LOCKED (user clarification) |
| click dimmed PLACE or NOTE marker in Zones mode | switch to that record’s mode and select the record | LOCKED (user clarification) |
| map `moveend` | recompute active current-view list | LOCKED |
| category checkbox | update PLACE markers + Places current-view list immediately | LOCKED |
| category colour/icon edit | update markers everywhere | LOCKED |
| edit used zone geometry | warn before Save; accepted change affects linked maps immediately | LOCKED |
| delete used zone | block deletion | LOCKED |
| edit shared map | preserve token/URL | LOCKED |
| archive shared map | URL stops working; entry moves to Archived | LOCKED |
| unarchive expired map | remains expired until future expiry set | LOCKED |
| add matching published PLACE after share | appears automatically | LOCKED |
| NOTE | never traveller-visible | LOCKED |

---

# 19. Precision audit — remaining ambiguities

## Resolved by user clarification

- Admin map visibility controls stay available in all three modes. PLACE categories have their own show/hide checkboxes; Notes have a separate visibility checkbox.
- PLACE markers are dimmed but clickable in Notes mode. PLACE and NOTE markers are both dimmed but clickable in Zones mode; clicking returns to the relevant record mode and selects the record.
- Share map opens as a full-page Admin-style workflow, with the configuration map contained in a bounded panel beside the form.
- On desktop, Admin destination pages fit within the viewport height including the header, without document-level vertical scrolling; content and contained previews adapt to available height.
- The desktop Admin shell is the canonical Places view; a duplicate standalone Places wireframe is not listed in the screen catalog.
- Manage categories, Shared maps and Import CSV open as dedicated Admin pages with the standard header and neutral surface; they do not retain the map.
- Zones mode lists all saved zones, not only zones in the current map view, and makes that scope explicit. All zones are in the Zones list regardless of viewport; selecting a zone focuses the map on its outline, while outlines outside the current extent remain offscreen.
- On mobile, Admin mode choices are stacked one per row in a bottom sheet with a horizontal drag handle.
- Traveller public title sits below the Petassos logo in the header. Show current traveller location on the map with a distinct marker and recenter control.
- Desktop/tablet traveller list and detail use the left side; opening detail replaces the list. Mobile list and detail use a bottom sheet, which initially leaves about the upper third of the map visible.

## High-priority OPEN decisions

| Question | Why it matters |
|---|---|
| How are traveller filters and searches arranged on mobile? | several overlays compete for limited space |

## Medium-priority OPEN decisions

| Question | Why it matters |
|---|---|
| Exact left-panel internal order in Places/Notes | Codex may choose differently |
| Exact widths/breakpoints | can be delegated if flexibility is acceptable |
| Exact Add PLACE choose-position prompt | banner vs panel state |
| Is zone search mandatory? | current wording says “when useful” |
| Exact used-zone warning presentation | logic fixed, presentation open |
| Exact 404/410 wording/layout | product polish |

---

# 20. Specification alignment

The main functional specification has been updated to reflect the latest UI decisions: persistent Admin map visibility controls, separate NOTE visibility, the full-page Admin-style sharing workflow with a contained map, desktop viewport-fit Admin pages, all-zone list scope, mobile Admin sheet layout, and traveller location/title placement. The desktop shell is the canonical Places wireframe.
