# Petassos Travel Map
## Consolidated functional and technical specification - Codex-ready

**Status:** consolidated implementation specification.  
**Primary goal:** implement the complete application with the simplest robust architecture that satisfies the requirements below.

> **Core rule:** if a simple solution exists, choose it. Avoid unnecessary services, abstractions, dependencies, duplicated logic, and speculative scalability work.

The written specification is authoritative. Included mock-ups are visual and interaction references. Some text or controls in older mock-ups may reflect previous iterations; if a mock-up conflicts with this specification, **the written specification wins**.

---

# 1. Product overview

Petassos Travel needs one web application centred on a full-screen interactive map.

It has two modes:

1. **Admin application**
   - authenticated;
   - fully usable on desktop, tablet and smartphone;
   - used to create and maintain places and internal notes;
   - manage categories;
   - manage geographic zones;
   - create and manage shared maps;
   - import places from CSV.

2. **Traveller shared map**
   - no account;
   - accessed through a unique shared URL;
   - mobile-first, but responsive on tablet and desktop;
   - displays only places currently authorised by that shared map.

The map always fills the viewport. Lists, forms, filters, search fields and controls are overlays, floating panels, drawers or bottom sheets over the map. Do not build a conventional page containing a small embedded map.

The same place database is used by Admin and traveller views. Traveller access rules are enforced by the backend.

---

# 2. Architectural principles

## 2.1 One lightweight application

Use:

- one React application;
- one MapLibre GL JS map implementation;
- one FastAPI application;
- one SQLite database;
- one persistent uploads directory;
- one shared Admin account.

In production, run **one application/service**: FastAPI serves the API, uploaded images and the compiled React frontend.

During development, the standard React/Vite development server may run separately.

Do **not** introduce unless a concrete later requirement makes it necessary:

- PostgreSQL/PostGIS;
- SpatiaLite;
- Redis;
- message queues;
- microservices;
- Directus or another CMS/admin framework;
- Redux or another global state library;
- a complex role/account system;
- Kubernetes or container orchestration;
- an ORM if plain SQLite access remains clearer.

Using Python's standard `sqlite3` module with parameterized queries is acceptable and preferred if it keeps the backend smaller.

## 2.2 Modular without becoming fragmented

The application must be modular enough that changing one feature does not require rewriting unrelated parts, but it must not be split into dozens of tiny files.

Important rules:

- a functional rule has one source of truth;
- place visibility rules exist once in the backend;
- Admin and traveller map rendering reuse the same map primitives where practical;
- `Create new zone` has one reusable implementation;
- geographic search is isolated behind one small geocoder adapter;
- zone storage/editing is isolated because zone requirements may change later;
- avoid duplicated validation in several places.

Modularity means **clear responsibilities**, not maximum file count.

## 2.3 The zone subsystem must be replaceable

The current implementation uses editable rectangular zones stored in SQLite.

This part of the product may change in the future. For example, Petassos may later use predefined, non-editable zones selected from a fixed list.

Therefore:

- keep zone CRUD, geometry handling and drawing logic inside a dedicated zone module;
- shared maps reference **zone IDs**, not copied coordinates;
- the sharing system consumes a simple zone interface (`id`, `name`, bounds/geometry, capability information) instead of depending on the storage implementation;
- the rest of the application must not assume that every zone is editable;
- future predefined/locked zones should be introducible mainly by changing the zone module.

Do **not** build a generic GIS framework. The objective is only to contain zone-specific logic so future changes do not break the rest of the app.

---

# 3. Recommended technologies and dependencies

## 3.1 Frontend

Required:

- React;
- MapLibre GL JS.

Recommended lightweight additions:

- `react-window` or a similar small virtualization library for long place lists;
- a small, maintained MapLibre-compatible drawing helper only if it makes rectangle creation/editing substantially simpler than custom code.

### UI styling

Use **plain CSS** for application layout and styling.

Do not use Bootstrap, Tailwind CSS, Material UI, Chakra UI, Ant Design, or another general-purpose CSS/component framework in the initial implementation.

The supplied visual mock-ups should be reproduced with lightweight custom CSS. Plain CSS is fully sufficient for the required responsive desktop/tablet/mobile layouts.

Use:

- CSS Grid and Flexbox for layout;
- media queries for responsive breakpoints;
- CSS custom properties (`:root` variables) for recurring design values such as primary colours, text colours, spacing, border radii, shadows, header height and panel backgrounds;
- a small number of reusable CSS classes rather than duplicated inline styles.

Component-specific CSS may be added when useful, but avoid introducing a CSS framework merely for convenience.

A small icon library for general UI actions is acceptable. PLACE category pictograms use Maki as specified later.

Use local React state and props. Add custom hooks only when they genuinely remove duplicated logic.

## 3.2 Backend

Required:

- FastAPI;
- SQLite.

Recommended:

- Pillow for uploaded-image validation, EXIF orientation and optional resizing;
- a maintained Argon2id password-hashing library.

No custom cryptography.

## 3.3 Basemap

Use OpenFreeMap **Bright** as the default visual direction:

`https://tiles.openfreemap.org/styles/bright`

The basemap style URL must be defined in one configuration location and must not be repeated throughout React components. It must be easy to replace later.

Keep the required map attribution visible.

---

# 4. Application routes

Keep routing minimal.

Recommended top-level routes:

```text
/admin/login
/admin
/s/{token}
```

A router library is optional. Use it only if it makes these routes cleaner.

When an unauthenticated user opens `/admin`, show or redirect to `/admin/login`.

The traveller route `/s/{token}` is independent of Admin authentication.

---

# 5. Core data model

There is currently only one Petassos dataset. Do **not** add `collection_id` unless a real multi-collection requirement appears later.

Enable SQLite foreign keys.

## 5.1 Categories

```text
categories
- id
- name
- icon
- color
```

Rules:

- name is required;
- category names are unique case-insensitively;
- `icon` is a **Maki** icon key. Maki is the default pictogram set for PLACE categories;
- the initial exact Maki icon chosen for each category does not need to be frozen in this specification: the implementer should choose the most semantically appropriate Maki icon, and the mapping must remain easy to change later;
- `color` is a validated colour value;
- categories can be created, renamed, recoloured and assigned another supported Maki icon;
- category deletion is blocked while the category is referenced by a PLACE or a shared map.

Suggested initial categories:

- Restaurant
- Hotel
- Sightseeing
- Hiking
- Beach
- Café
- Shopping
- Museum

Default marker palette:

`#C90046` · `#FFB800` · `#0AA8AD` · `#39A90D` · `#0D84CF` · `#EB6500` · `#8B2BB0` · `#81583F`

Initial category assignment:

- Restaurant `#C90046`
- Hotel `#FFB800`
- Sightseeing `#0AA8AD`
- Hiking `#39A90D`
- Beach `#0D84CF`
- Café `#EB6500`
- Shopping `#8B2BB0`
- Museum `#81583F`

These are the default values. Category colours remain editable in Admin; changing a category colour updates its markers everywhere.

## 5.2 Places and NOTES

Use a single `places` table with a discriminator:

```text
places
- id
- kind              PLACE | NOTE
- category_id       required for PLACE, NULL for NOTE
- name
- description
- author            optional for both PLACE and NOTE
- latitude
- longitude
- published
- created_at
- updated_at
```

All timestamps are stored in UTC.

### PLACE rules

A normal `PLACE`:

- must have a name;
- must have coordinates;
- must have **exactly one category**;
- may have a description;
- may have an author;
- may have images;
- may be Draft or Published.

A PLACE must never have zero categories or several categories.

Because a PLACE has exactly one category, **do not create a many-to-many `place_categories` table**. Store the single `category_id` directly on `places`.

### NOTE rules

A `NOTE`:

- is an internal Admin marker;
- has no category (`category_id = NULL`);
- must have a name/title;
- may have a description;
- may have an author;
- may have images;
- has coordinates;
- can never be published;
- can never be returned by traveller/shared APIs.

Backend validation must enforce:

```text
kind = PLACE -> category_id IS NOT NULL
kind = NOTE  -> category_id IS NULL
kind = NOTE  -> published = false
```

Do not rely only on hiding frontend controls.

NOTES reuse the normal marker placement, image, selection and editing mechanics wherever practical.

## 5.3 Images

```text
place_images
- id
- place_id
- file_path
- caption           optional
- sort_order
- created_at
```

Rules:

- a PLACE or NOTE may have zero, one or several images;
- `caption` is optional;
- image order is deterministic;
- the image with the smallest `sort_order` is the default/cover image;
- explicit drag-and-drop image reordering is not required initially; upload order may define `sort_order`;
- deleting a PLACE or NOTE deletes its image rows and corresponding image files;
- actual images are stored under `/uploads/`, not as SQLite blobs.

## 5.4 Zones

Current storage:

```text
zones
- id
- name
- min_lat
- max_lat
- min_lon
- max_lon
```

No zone timestamps are required.

Current geometry is deliberately restricted to rectangles.

The zone API may expose capability information such as:

```text
can_edit
can_delete
used_by_count
```

This lets the frontend remain compatible with possible future predefined/non-editable zones without building a complex abstraction now.

## 5.5 Shared maps

```text
share_links
- id
- internal_name
- public_title
- token
- expires_at
- archived
- created_at
```

Rules:

- `internal_name` is required and visible only to Admin;
- `public_title` is required and is the title displayed to travellers;
- `token` is a long random URL-safe bearer token generated server-side, e.g. `secrets.token_urlsafe(32)`;
- `expires_at` is stored in UTC;
- `archived` defaults to false.

For simplicity, store the stable token as an opaque value in SQLite. Do not log it. Do not expose it except where needed to validate the public URL and to let Admin copy that same URL later.

Do not introduce encryption/key-management complexity solely for this token.

Shared-map status is derived, not stored separately:

```text
ARCHIVED if archived = true
EXPIRED  if archived = false and expires_at <= now
ACTIVE   if archived = false and expires_at > now
```

## 5.6 Shared-map associations

```text
share_link_zones
- share_link_id
- zone_id

share_link_categories
- share_link_id
- category_id
```

Use composite unique constraints so the same zone/category cannot be attached twice to the same shared map.

---

# 6. Validation and referential integrity

## 6.1 PLACE

Required:

- name;
- latitude;
- longitude;
- exactly one valid category.

Optional:

- description;
- author;
- images.

## 6.2 NOTE

Required:

- name/title;
- latitude;
- longitude.

Optional:

- description;
- author;
- images.

Forbidden:

- category;
- publication.

## 6.3 Zone

Required:

- name;
- valid rectangular bounds.

## 6.4 Shared map

Creation requires:

- internal name;
- public title;
- at least one zone;
- at least one allowed category;
- an expiry date/time in the future.

Editing may change:

- internal name;
- public title;
- zones;
- allowed categories;
- expiry;
- archived state.

Editing must never silently replace the token.

## 6.5 Deletion rules

- PLACE/NOTE: hard deletion allowed after confirmation.
- Category: deletion blocked while referenced by a PLACE or shared map.
- Zone: deletion blocked while referenced by a shared map.
- Shared map: normal workflow uses **Archive**, not hard delete.

---

# 7. Visual design and style

Style is a formal requirement, not an optional polish phase.

The application should follow the visual family of the supplied mock-ups:

- bright, clean and light;
- **white header**;
- no permanent dark sidebar;
- map remains visually dominant;
- dark navy text;
- clear blue primary action buttons;
- green may be used for the main `Share map with client` action;
- rounded cards and controls;
- subtle borders and shadows;
- generous whitespace;
- simple modern sans-serif typography;
- readable interface text: use at least 13 CSS pixels for labels, controls and supporting text, following the accepted wireframe scale;
- category colours visible but not overwhelming;
- desktop and mobile controls visually consistent;
- avoid a dense enterprise-dashboard appearance.

The exact pixels are not frozen. The goal is to preserve the interaction hierarchy and overall visual language.

## 7.1 PLACE marker design

PLACE pictograms use the **Maki** icon set. The exact initial Maki icon for each category may be chosen during implementation using the best semantic match. Keep this mapping centralized and editable so an icon can be changed without touching map-rendering code.

### Unselected PLACE

- shape: simple filled **circle**;
- fill: the PLACE category colour;
- pictogram: centred **white Maki icon**;
- no tail/pin shape;
- compact enough to keep maps with many markers visually light.

### Selected PLACE

The selected PLACE must be immediately recognizable and should follow the supplied marker reference:

- keep the same coloured circular core and the same white Maki pictogram;
- make the marker slightly larger than an unselected marker;
- place the coloured circle inside a **white teardrop/map-pin silhouette with a short tail below**;
- a subtle shadow may be used;
- do not change the category colour when selecting.

Only selection changes the marker shape. This makes the normal map lighter while giving the active PLACE a precise visual anchor.

The teardrop/pin silhouette is a small **local Petassos application asset**, not part of the basemap. Keep it in one frontend asset location (for example `assets/selected-place-pin.svg`) so its shape can be changed later without rewriting marker logic.

The implementation may use MapLibre layers/symbol images to reproduce these states. Do not create one DOM marker per PLACE.

Selection remains synchronized with the corresponding list card.

## 7.2 NOTE style

NOTE marker:

- clearly different shape from normal PLACE markers;
- amber/yellow note/sticky-note visual treatment;
- distinction must not depend on colour alone.

NOTE list/edit treatment:

- very light yellow/cream tint;
- small `NOTE` badge;
- same structural layout as PLACE editing;
- no category selector;
- no usable Published toggle;
- explicit `Internal note - never shared` indication.

## 7.3 Visual references

The final DOCX/PDF should include the supplied Admin, mobile and zone-management mock-ups as visual references.

Important: some labels in older mock-ups may be obsolete. **The written specification is authoritative.**

Examples of written rules that override older screenshots:

- a PLACE has exactly one category;
- NOTES have no category;
- geographic search and Petassos marker search are separate;
- bulk import is CSV, not GeoJSON;
- the zone subsystem is deliberately replaceable.

---

# 8. Admin authentication

One shared Admin account is sufficient.

No named staff accounts or roles are required initially.

Several people may use the shared account in separate sessions at the same time. Signing in or out in one browser must not invalidate another browser's session. Changes made by one Admin do not need to appear live in other open browsers in the first version; those browsers may need to refresh.

Before routine simultaneous editing, add conflict detection for records changed since an editor opened them. A stale save must not silently overwrite someone else's changes; show a clear choice to reload or review the conflict. Separate named accounts and live synchronization can be considered later.

Recommended configuration:

```text
ADMIN_USERNAME
ADMIN_PASSWORD_HASH
SESSION_SECRET
```

Rules:

- never store the password in plaintext;
- use Argon2id through a maintained library;
- do not use JWT unless a later requirement needs it;
- use a secure signed cookie session;
- cookie must be `HttpOnly`;
- `Secure` in production;
- `SameSite=Lax`;
- finite expiration;
- never store Admin credentials/session tokens in `localStorage`;
- every `/api/admin/...` endpoint validates authentication server-side;
- production frontend and backend should be same-origin; do not enable broad CORS.

When logged out, do not render Admin data behind the login form.

Logging out immediately returns to the login screen.

---

# 9. Main Admin interface

## 9.1 Full-screen map and header

The Admin map fills the viewport.

Desktop:

- use a persistent **white top header** across the Admin interface;
- left side: Petassos Travel logo/branding followed by the `Map administration` context label;
- far right: compact `Admin` control;
- immediately to the left of the Admin control: the prominent `Share map with client` button;
- keep the remaining header visually light; it is not a dense navigation bar;
- the map occupies the remaining viewport and remains the dominant visual element.

The desktop header order is therefore:

`[Petassos Travel | Map administration] ................................ [Share map with client] [Admin]`

The same header structure should remain consistent across the Admin application.

Mobile:

- retain the same white-header visual language;
- Petassos branding stays on the left;
- use a compact hamburger/Admin menu on the right;
- `Share map with client` does not need to remain permanently visible in a narrow mobile header and may be accessed from the Admin menu;
- keep the map full-screen behind the responsive panels/bottom sheet;
- use a familiar horizontal drag handle at the top of the Admin bottom sheet;
- stack the `Places`, `Notes` and `Zones` mode controls vertically, one per row;
- all Admin functionality remains available.

## 9.2 Left-panel tabs and Admin menu

The main Admin work panel has exactly three top-level tabs:

`Places | Notes | Zones`

These three tabs are the primary way to switch between the three map-management modes. Switching tabs must **not** navigate away from the map or reload the application; it only changes the contents and controls of the responsive left panel/bottom sheet and the relevant map overlays.

Do not show a `MAP ADMINISTRATION` overline beneath the `Places | Notes | Zones` selector.
Do not show an undefined three-dot overflow button beside the Places, Notes or Zones panel title.

### Places tab

The `Places` tab contains:

- current-view PLACE list;
- PLACE search;
- publication-state filters;
- `Show all`;
- `Add a new place`;
- PLACE selection/editing.

PLACE category visibility is controlled by the persistent map visibility panel on the right side of the map. This panel remains available in Places, Notes and Zones modes; do not duplicate category controls inside the Places panel. A separate Notes checkbox controls NOTE marker visibility.

### Notes tab

The `Notes` tab contains:

- current-view NOTE list;
- NOTE search;
- `Add NOTE`;
- NOTE selection/editing.

NOTES are not a category and do not use PLACE category/publication filters.

In Notes mode, PLACE markers remain visible but are visually dimmed so NOTE markers stand out. Dimmed PLACE markers remain clickable. Clicking one switches to Places mode and selects that PLACE. The persistent PLACE category controls continue to apply.

Do not show an instructional hint in the Notes panel explaining that dimmed PLACE markers are clickable or switch to Places mode.

### Zones tab

The `Zones` tab opens the zone-management mode defined in section 13:

- list of all saved zones, independent of the current map viewport;
- zone list;
- zone search when useful;
- `New zone`;
- selection/highlighting;
- editing;
- deletion where allowed;
- zone rectangles on the map.

This tab is the normal entry point to zone management.

In Zones mode, PLACE and NOTE markers remain visible but are visually dimmed so zone boundaries stand out. Both types remain clickable. Clicking a PLACE switches to Places mode and selects it; clicking a NOTE switches to Notes mode and selects it.

Do not show an instructional hint in the Zones panel explaining the dimmed-marker behavior or mode switching.

### Admin menu

`Import CSV` is **not** a left-panel tab.

The compact `Admin` control in the top-right header opens the Admin menu. Keep this menu short. At minimum it contains:

- **Manage categories**;
- Shared maps;
- Import CSV;
- Log out.

On mobile, the top-right hamburger/Admin menu exposes the same Admin-menu functions. The three main work modes - `Places`, `Notes`, and `Zones` - remain available as the same tab/segmented control at the top of the mobile bottom sheet whenever practical.

Do not duplicate `Import CSV` as a tab or permanent map control.

## 9.3 Current-view lists

`Places` and `Notes` each have their own current-view list.

In the `Places` tab, the list contains PLACE markers currently inside the visible map viewport after active PLACE filters.

In the `Notes` tab, the list contains NOTE markers currently inside the visible map viewport.

Example headings:

`PLACES IN CURRENT VIEW (23)`

`NOTES IN CURRENT VIEW (4)`

Update the active current-view list after map pan/zoom completes (`moveend`), not continuously during map movement.

A list may contain thousands of items when zoomed out.

Use virtualization. Do not add pagination and do not force the Admin to zoom in.

Clicking a PLACE card opens the shared PLACE editor with that record's saved values populated. The same editor is used to create and edit PLACEs: Add PLACE first asks Admin to choose a map position, then opens the form in create mode.

In Places mode, clicking a PLACE marker selects the matching PLACE and highlights its card in the list. It does not open the editor. In Notes or Zones mode, clicking a dimmed PLACE marker switches to Places mode and selects/highlights the matching card, without opening the editor.

The `Zones` tab uses the zone-management list defined in section 13 rather than a marker current-view list.

## 9.4 PLACE filters

PLACE category visibility is controlled by the persistent right-side map panel in all three Admin modes. It contains one show/hide checkbox per category; changes immediately update PLACE markers and the Places current-view list.

The `Places` panel separately filters publication state: All / Published / Draft. Publication filtering applies to the Places list and PLACE markers. It is not shown in Notes or Zones.

The right-side map panel also contains a separate NOTE visibility checkbox. NOTE visibility affects NOTE markers only; it does not add Notes to the Places list.

## 9.5 Petassos record search

The search field inside the active `Places` or `Notes` panel searches Petassos records, not geographic locations.

In `Places`:

Suggested placeholder:

`Search among X places...`

Searches PLACE names globally across loaded Admin PLACE records, not only the current viewport.

In `Notes`:

Suggested placeholder:

`Search notes...`

Searches NOTE names/titles globally across loaded Admin NOTE records.

Selecting an off-screen result:

1. selects it;
2. pans/zooms the map to it;
3. waits for map movement to finish;
4. recomputes the active current-view list;
5. highlights and scrolls the matching card into view.

Searching descriptions is not required initially.

## 9.6 Geographic location search

A second, visually separate search bar appears **directly on the map**.

It searches geographic locations such as:

- cities;
- villages;
- streets;
- addresses;
- named places.

It is completely separate from Petassos PLACE/NOTE search.

Selecting a geographic result moves/zooms the map to the returned location. It does not select or create a Petassos PLACE or NOTE.

See section 18.

## 9.7 Show all

In the `Places` tab, a compact `Show all` action uses `fitBounds()` to show all PLACE markers matching the current PLACE filters.

In the `Notes` tab, `Show all` may similarly fit all NOTES if useful.

The `Zones` tab uses the zone-specific fit/highlight behaviour defined in section 13.

## 9.8 Synchronized map/list selection

There is one selected-record state within the active tab.

Marker click:

- selects the record;
- highlights the marker;
- highlights matching list card;
- scrolls the card into view if necessary.

List card click:

- selects the card;
- highlights matching marker;
- gently centres the map if useful.

Do not open a redundant map popup for ordinary selection if the same information is already visible in the panel.

---

# 10. Add and edit PLACE / NOTE

## 10.1 Add PLACE

Flow:

1. click/tap `Add a new place`;
2. interface asks Admin to choose a position;
3. Admin clicks/taps the map;
4. open the same form used for editing;
5. Save.

This must work comfortably on smartphone while physically on site.

Latitude and longitude may be shown in the PLACE form as compact, visually secondary fields. They remain editable, so Admin can fine-tune or enter coordinates directly after choosing an initial map position.

## 10.2 Edit PLACE

Keep the map visible.

Form:

- Name;
- Category - **single-select, required**;
- Description;
- Images;
- Latitude;
- Longitude;
- Author - optional, directly before the display/publication toggle;
- Published;
- Delete;
- Cancel;
- Save.

Latitude and longitude fields must remain available but visually discreet compared with the main place details.

The selected marker remains highlighted and may be dragged to update its position.

Save returns to the normal list with the PLACE still selected.

Cancel restores original data and original marker position.

## 10.3 Add/Edit NOTE

Reuse the same underlying editor where practical.

Differences:

- `kind = NOTE`;
- no category field;
- no publication switch;
- `Internal note - never shared`;
- optional Author;
- NOTE tinted visual style;
- distinct NOTE marker.

---

# 11. Category management

The normal entry point is `Admin -> Manage categories`.

Open category management as a dedicated Admin page using the standard white Admin header, light neutral background and centered content surface. The map does not need to remain visible on this page.

This screen is for changing the category definitions themselves. It is deliberately separate from the floating category checkboxes used to hide/show PLACE markers on the map.

Admin can:

- list categories;
- add category;
- rename category;
- change icon;
- change colour;
- delete an unused category.

Deleting a category used by at least one PLACE or shared map must be rejected by the backend with a clear message.

Renaming/recolouring updates all corresponding displays dynamically because records reference category IDs.

---

# 12. Images

Admin can:

- upload several images to a PLACE or NOTE;
- preview images;
- optionally add/edit a caption;
- delete an image.

Supported initial formats:

- JPEG;
- PNG;
- WebP.

Backend:

- validate actual image content with Pillow, not only file extension;
- reject invalid images;
- enforce configurable maximum upload size;
- generate server-side filenames;
- never use the client filename as a filesystem path;
- correct EXIF orientation;
- downscale extremely large images to a configurable maximum dimension;
- store final files under `/uploads/`;
- serve them through FastAPI.

Do not add object storage or an image microservice.

---

# 13. Zones - current implementation

The current requirement is editable rectangular zones.

This section is intentionally isolated because zone requirements may change later.

Numeric zone coordinates/bounds do not have to appear in the interface. Admin works with zones by viewing and drawing or editing their rectangles on the map; a zone name is required.

## 13.1 Admin -> Zones

`Admin -> Zones` is an explicit management section.

It contains:

- full-screen map;
- responsive zone list/panel;
- all saved zones, with an explicit label that this list is independent of the current map viewport;
- zone rectangles rendered on the map; only areas within the current viewport are visible;
- selecting a zone focuses the map on it and highlights its rectangle;
- `New zone`;
- Edit;
- Delete where allowed.

Selecting a zone in the list highlights its rectangle.

Clicking a rectangle selects/highlights the corresponding zone in the list.

The map may centre/fit the selected zone.

## 13.2 Create zone

Current workflow:

1. `New zone`;
2. draw rectangle on map;
3. enter mandatory zone name;
4. Save.

The drawing implementation may use handles or a lightweight drawing library.

## 13.3 Edit zone

Admin can:

- rename;
- move;
- resize the rectangle.

If a zone is referenced by shared maps, changing its geometry immediately changes which places fall inside those shared maps.

Before saving a geometry change to a used zone, show a confirmation such as:

> This zone is used by 3 shared maps. Changes to its boundaries will affect these maps immediately.

Do not block the edit.

Renaming changes only the Admin-facing zone name.

## 13.4 Delete zone

An unused zone may be deleted after confirmation.

A zone referenced by one or more shared maps cannot be deleted.

This must be enforced server-side.

Example:

> This zone is used by 3 shared maps and cannot be deleted. Edit those shared maps first.

## 13.5 Future-proofing

All other modules must interact with zones through the zone API/module rather than directly manipulating `min_lat`, `max_lat`, etc.

A future version may provide predefined, non-editable zones. Such a change should mainly affect:

- zone data source;
- zone management UI;
- capability flags such as `can_edit` and `can_delete`.

It should not require rewriting shared-map visibility logic.

---

# 14. Share map with client

## 14.1 Shared-map creation

`Share map with client` opens a full-page Admin workflow, not a side panel. Use the same white Admin header, light neutral page background, and centered content surfaces as the other Administration pages. The configuration map sits inside the page in a bounded panel beside the settings; it does not become the full-page background.

On desktop, Admin destination pages must fit within the available viewport height, including the header, without requiring document-level vertical scrolling. Content and contained previews should adapt to the available height. This does not change the agreed mobile bottom-sheet interactions within map screens.

Required:

- Internal name;
- Public title;
- Zones;
- Allowed categories;
- Expiry.

The `public_title` is the map title shown to the traveller.

## 14.2 Configuration map

The configuration map displays normal PLACE markers.

Use small/simple category-coloured markers if this makes the configuration clearer.

NOTES are hidden.

When zones/categories change:

- selected zone rectangles remain visible;
- candidate markers inside selected zones remain prominent;
- markers outside may be de-emphasized;
- changing allowed categories updates candidate markers immediately.

This is the configuration view. Do **not** create a redundant separate `Preview visitor view`.

## 14.3 Select existing zones

The `Select existing zones` interface lists zone names with checkboxes.

Checking a zone:

- includes it in this shared map;
- displays its rectangle immediately.

Unchecking:

- removes it from the shared map;
- removes its rectangle from the selection display.

Clicking a zone name may centre the map on that zone without toggling selection.

If several zones are checked:

- display all selected rectangles simultaneously;
- actual shared geographic area = **union of all selected rectangles**.

After every selection/deselection, use `fitBounds()` on the smallest bounding box containing all currently selected rectangles, with suitable padding.

Important:

> The enclosing `fitBounds()` bounding box controls only the camera. It is **not** the shared geographic area.

One selected zone -> fit that zone.

No selected zones -> appropriate default sharing-map view.

## 14.4 Create a zone from the sharing workflow

`Select existing zones` contains `New zone`.

Use exactly the same Create-zone implementation as `Admin -> Zones`.

Only the return context differs:

- launched from `Admin -> Zones` -> Save returns to `Admin -> Zones`;
- launched from `Share map -> Select existing zones` -> Save returns to `Select existing zones` and the new zone is automatically selected.

Do not duplicate zone-creation code.

General zone renaming/reshaping/deletion belongs to `Admin -> Zones`.

---

# 15. Shared-map visibility semantics

Shared maps are **dynamic**, not snapshots.

At every shared request, a PLACE is visible only if all conditions are true:

```text
kind = PLACE
published = true
category_id belongs to the shared map's allowed categories
coordinates are inside at least one selected zone
shared map exists
shared map is not archived
shared map is not expired
```

Because each PLACE has exactly one category, category matching is simple.

NOTES are never eligible.

Consequences:

- adding a new published PLACE later makes it appear automatically when it matches;
- editing PLACE content changes what travellers see;
- moving a PLACE into/out of selected zones changes visibility;
- publishing/unpublishing changes visibility;
- changing category changes visibility;
- editing a zone rectangle immediately affects every shared map using it;
- changing allowed categories immediately affects visibility.

Do not store a snapshot/list of authorised place IDs.

---

# 16. Shared-map lifecycle

## 16.1 Stable URL

Editing any of the following must keep the same URL/token:

- internal name;
- public title;
- zones;
- allowed categories;
- expiry;
- archived/unarchived state.

## 16.2 Active

`archived = false` and expiry is in the future.

The public URL works.

## 16.3 Expired

`archived = false` and expiry is in the past.

The public URL returns an expired response.

Admin may set a new future expiry and reactivate the **same URL**.

## 16.4 Archived

Archive is the normal way to remove an old shared map from active management.

When archived:

- public URL stops working;
- shared map disappears from the default Shared maps list;
- it remains available under an `Archived` filter/tab;
- Admin may unarchive it later;
- same token/URL is retained.

If unarchived while expiry is still in the past, it remains Expired until the expiry is changed.

No routine permanent-delete action is required for shared maps in the first version.

---

# 17. Shared-map management

Open shared-map management as a dedicated Admin page using the standard white Admin header, light neutral background and centered content surface. The map does not need to remain visible on this page.

Default list shows non-archived shared maps.

For each shared map show:

- internal name;
- public title if useful;
- selected zones;
- allowed categories;
- valid until;
- status: Active or Expired;
- actions: Copy link, Edit, Archive.

Archived view/filter shows archived maps with:

- Edit;
- Copy link;
- Unarchive.

Expired links are editable and can be reactivated by setting a future expiry.

Archive/unarchive never changes the token.

---

# 18. Geographic search / geocoding

Geographic search is required for both Admin and traveller maps.

It is separate from Petassos marker search and appears as a floating search field **on the map**.

No geocoder result is stored in the Petassos database.

## 18.1 Provider architecture

Keep provider-specific code in one small `geocoder.js` adapter and keep the base URL/configuration in one place. The rest of the application must only consume a simple normalized result format such as:

```text
label
latitude
longitude
optional bounding_box
```

This must make it easy to switch geocoding provider later without changing the map, Admin or traveller components.

For the initial lightweight implementation, a public **Nominatim/OpenStreetMap** search endpoint is acceptable **only for direct user-triggered searches and only while usage remains compliant with its public-service policy**. Do not implement client-side autocomplete against the public Nominatim service. Send a request only when the user explicitly submits a query (Enter/Search), keep requests comfortably below the service limit, show OpenStreetMap attribution, and keep the provider replaceable.

If real production traffic makes the public service unsuitable, switch `geocoder.js` to another hosted geocoding provider; do not add a geocoding database to this application.

## 18.2 Geographic bias

Search must technically allow worldwide results, but initially bias results toward Greece.

For Nominatim, use a Greece-oriented `viewbox` **without** hard-bounding the results. This gives Greek results priority while still allowing a user to find a location elsewhere.

The bias must be one configuration value so it can later be changed or removed if Petassos expands beyond Greece.

## 18.3 Admin geographic search

Selecting a result:

- pans/zooms the map;
- may fit the result bounding box when one is supplied;
- does not create a PLACE;
- does not change Petassos marker selection.

## 18.4 Traveller geographic search

Same principle.

It searches geographic locations independently of shared Petassos places and must not leak private Petassos data.

---

# 19. Traveller interface

## 19.1 General layout

No login.

Access only through `/s/{token}`.

Mobile-first full-screen map.

White/light overlay style consistent with Admin.

Show:

- Petassos identity in the header;
- required shared-map `public_title` directly below the logo in the header;
- geographic search on map;
- authorised category filters;
- access to Petassos place list.

No Admin controls.

## 19.2 Authorised category filters

Show only categories allowed by the shared map. The traveller current position is shown with a distinct location dot and accuracy halo when browser location permission is available. A map control requests/centres on the device location; if location is unavailable or denied, do not show a fabricated position.

Initial state: all allowed categories visible.

Traveller may temporarily show/hide these authorised categories.

The traveller cannot discover categories not included in the shared map.

## 19.3 Traveller place list

The list contains authorised PLACE records in the current map viewport.

Update after map movement finishes.

Desktop/tablet:

- place list in a floating panel on the left side of the map on desktop and tablet.

Mobile:

- place list in a draggable bottom sheet;
- when open for browsing, the sheet rises from the bottom and leaves about the upper third of the map visible;
- collapsed state may show only a small horizontal drag bar/handle;
- intermediate state shows several places while map remains visible;
- expanded state allows comfortable list browsing.

The **handle** is the small horizontal bar at the top of the bottom sheet used to drag it up/down.

Use virtualization if many places are visible.

## 19.4 Traveller Petassos marker search

Petassos place search belongs inside the list/bottom-sheet interface.

It searches all PLACE records authorised by that shared map, not only the current viewport.

Selecting a result:

- selects the PLACE;
- moves map to it;
- updates current-view list;
- highlights matching marker/list item.

This search is separate from geographic location search.

## 19.5 Map/list synchronized selection

Marker click:

- select marker;
- highlight corresponding list card;
- reveal/scroll it in the bottom sheet or side panel.

List click:

- select marker;
- gently centre map;
- highlight card/marker.

## 19.6 Place detail

On desktop and tablet, place detail opens in a panel from the left and replaces the place-list panel. Closing the detail returns to the list.

On mobile, place detail rises from the bottom in a bottom sheet, initially leaving about the upper third of the map visible.

Display:

- name;
- category;
- author if present;
- image(s);
- optional image captions;
- description.

---

# 20. Admin data loading and performance strategy

Expected scale is approximately **10,000 total records**, which is small enough to keep the architecture simple.

Recommended strategy:

- Admin loads the place/note dataset needed for map/list operation in one request;
- MapLibre receives GeoJSON and renders markers as layers;
- current-view filtering is done client-side from map bounds;
- Admin global marker search can be client-side over loaded records;
- traveller loads only the currently authorised shared dataset;
- traveller current-view filtering/search runs client-side on that authorised dataset.

Do not create one React/DOM marker per place.

Do not add clustering initially.

Do not add server-side spatial queries initially.

If real future data volume makes this strategy insufficient, it can be revisited then.

---

# 21. CSV bulk import

Admin -> Import CSV.

Admin -> Import CSV opens a dedicated Admin page using the standard white Admin header, light neutral background and centered content surface. The map does not need to remain visible during import.

CSV import creates **new PLACE records only**.

It does not update existing records and does not import NOTES.

Required columns:

```text
name
latitude
longitude
category
```

Optional columns:

```text
description
author
published
```

Rules:

- category must resolve case-insensitively to an existing category;
- unknown categories are validation errors; do not auto-create categories with arbitrary colours/icons;
- `published` defaults to false when absent;
- coordinates and all normal PLACE validation rules apply;
- import never matches/update records by name;
- re-importing the same file can therefore create duplicates; this is acceptable and should be clear in the UI.

Recommended workflow:

1. upload CSV;
2. backend parses and validates;
3. show preview / valid-row count / row-level errors;
4. Admin confirms;
5. valid rows are inserted.

Invalid rows do not need to block import of valid rows.

No image import in CSV initially.

No GeoJSON import initially.

---

# 22. API outline

Routes are indicative. Merge or simplify them if that makes the implementation clearer without weakening access control.

```text
POST   /api/admin/login
POST   /api/admin/logout
GET    /api/admin/session

GET    /api/admin/places
POST   /api/admin/places
PUT    /api/admin/places/{id}
DELETE /api/admin/places/{id}

POST   /api/admin/places/{id}/images
PUT    /api/admin/images/{id}
DELETE /api/admin/images/{id}

GET    /api/admin/categories
POST   /api/admin/categories
PUT    /api/admin/categories/{id}
DELETE /api/admin/categories/{id}

GET    /api/admin/zones
POST   /api/admin/zones
PUT    /api/admin/zones/{id}
DELETE /api/admin/zones/{id}

GET    /api/admin/share-links
POST   /api/admin/share-links
PUT    /api/admin/share-links/{id}

POST   /api/admin/import/places/preview
POST   /api/admin/import/places

GET    /api/shared/{token}
GET    /api/shared/{token}/places
```

A separate `/places/{id}` public route is optional. If all authorised place details are already returned by `/places`, do not add it unnecessarily.

There is deliberately **no normal DELETE route for shared links**. Archive through the update route.

---

# 23. Shared-link HTTP behaviour and security

Backend validates the token on every shared request.

Recommended responses:

- unknown/nonexistent token -> HTTP 404;
- expired link -> HTTP 410;
- archived link -> HTTP 410.

Do not expose:

- NOTES;
- drafts;
- places outside selected zones;
- places from unauthorised categories;
- Admin-only internal names;
- session data;
- password hashes;
- unrelated zones/shared links.

If a public detail route is implemented, an inaccessible PLACE must return the same 404 as a nonexistent PLACE to avoid enumeration.

---

# 24. SQLite and migrations

At connection startup:

```text
PRAGMA foreign_keys = ON
PRAGMA journal_mode = WAL
```

Use:

- parameterized SQL;
- transactions for multi-write operations;
- database constraints wherever practical;
- foreign-key `RESTRICT` for protected category/zone deletion;
- `CASCADE` for dependent image rows and join rows where appropriate.

Use a very small migration system.

Example:

```text
schema_version
- version
```

Migrations may simply be numbered SQL/Python functions executed in order.

Do not introduce Alembic unless the backend later adopts an ORM and it becomes genuinely useful.

---

# 25. Dates and time zones

Store all timestamps in UTC.

For shared-link expiry:

- Admin enters/selects a date/time in the browser's local timezone;
- frontend sends an ISO timestamp with timezone information;
- backend converts/stores UTC;
- frontend converts back to local time for display.

Do not compare naive datetimes.

---

# 26. Production storage and backup

Persistent:

```text
/data/app.db
/uploads/
```

Back up both together.

README must document:

- backup;
- restore;
- database migration;
- how to set Admin credentials/secrets;
- how to build frontend;
- how to start production app.

A database backup without `/uploads/` is incomplete.

---

# 27. Configuration

Recommended environment variables:

```text
ADMIN_USERNAME
ADMIN_PASSWORD_HASH
SESSION_SECRET
BASE_URL
DATA_DIR
UPLOAD_DIR
MAP_STYLE_URL
GEOCODER_BASE_URL
MAX_UPLOAD_MB
MAX_IMAGE_DIMENSION
```

Provide `.env.example` containing no real secrets.

Production startup should fail clearly if critical secrets are absent or use known unsafe defaults.

---

# 28. Logging

Keep logging simple.

Log:

- startup;
- database migration;
- Admin login success/failure without password;
- unexpected server errors;
- import summary;
- important storage errors.

Never log:

- passwords;
- password hashes;
- session secrets;
- complete shared-link tokens.

---

# 29. Suggested code structure

Keep the project compact.

Example:

```text
/backend
    main.py          # FastAPI app, auth, place/category/image/import routes
    database.py      # SQLite connection, schema, migrations, shared helpers
    zones.py         # zone CRUD + geometry/capabilities; deliberately isolated
    sharing.py       # shared-map CRUD/status + visibility rules

/frontend
    src/
        App.jsx
        Map.jsx
        Admin.jsx
        Traveller.jsx
        Zones.jsx
        Sharing.jsx
        api.js
        geocoder.js
        styles.css

/data
    app.db

/uploads

README.md
.env.example
```

This structure is indicative.

Split a file only when it becomes genuinely difficult to understand.

Zone code is intentionally separated because its specification is likely to evolve.

Do not create a file for every tiny component.

---

# 30. Essential functional tests

At minimum test the following.

## Authentication

- valid Admin login;
- invalid login rejected;
- Admin endpoint without authentication rejected;
- logout invalidates Admin session.

## PLACE / NOTE rules

- PLACE without category rejected;
- PLACE with invalid category rejected;
- NOTE with category rejected;
- NOTE cannot be published;
- NOTE never returned by shared API;
- optional author accepted for PLACE;
- optional author accepted for NOTE;
- created/updated timestamps set correctly.

## Images

- valid image upload works;
- invalid file rejected;
- deleting record removes associated image records/files;
- optional caption persists.

## Shared visibility

- draft PLACE never visible;
- PLACE outside all authorised zones never visible;
- PLACE in any one of several selected zones is geographically eligible;
- unauthorised category never visible;
- new matching published PLACE added after link creation appears automatically;
- moving PLACE in/out of zone changes visibility;
- changing category changes visibility;
- editing zone geometry immediately affects linked shared maps.

## Shared-map lifecycle

- valid active link works;
- unknown token -> 404;
- expired link -> 410;
- archived link -> 410;
- expired map can be reactivated with future expiry and same URL;
- archived map can be unarchived with same URL;
- editing title/zones/categories/expiry keeps exact same token;
- public title is returned/displayed;
- internal name is not sent to traveller unnecessarily.

## Zones

- zone creation requires name and rectangle;
- selected zone/list state synchronized;
- geometry can be moved/resized;
- deleting unused zone succeeds;
- deleting referenced zone is rejected;
- geometry edit of referenced zone triggers warning in UI;
- shared visibility reflects updated geometry;
- creation from Admin and sharing uses the same create-zone implementation;
- creating from sharing returns to selection and auto-selects new zone;
- checking/unchecking zones shows/hides rectangles;
- multiple selected zones remain visible;
- map viewport fits bounding box containing all selected rectangles;
- access area remains union of selected rectangles, not enclosing camera bounding box.

## Search

- Admin Petassos search can find PLACE and NOTE records outside current viewport;
- traveller Petassos search only finds authorised PLACE records;
- geographic search moves map but does not select/create Petassos records;
- Admin and traveller geographic search use the same provider adapter.

## CSV

- invalid CSV rows reported;
- valid rows import even when some rows are invalid;
- CSV creates records only;
- unknown category rejected;
- no update-by-name occurs.

## Responsive UI

- all core Admin actions usable at smartphone viewport;
- desktop Admin left panel exposes exactly three primary tabs: Places, Notes and Zones;
- Import CSV is accessible from the top-right Admin menu and is not shown as a left-panel tab;
- `Admin -> Manage categories` opens category administration;
- while Places is active, a floating map panel shows one checkbox per category;
- unchecking a category immediately hides its markers and removes its records from the current-view list;
- switching Places / Notes / Zones changes the work panel without leaving or reloading the map;
- in Notes mode, PLACE markers remain dimmed but clickable; clicking one switches to Places mode and selects it;
- in Zones mode, PLACE and NOTE markers remain dimmed but clickable; clicking one switches to its mode and selects it;
- traveller bottom sheet works at smartphone viewport;
- map/list selection synchronized on desktop and mobile.
- unselected PLACE markers render as coloured circles with white Maki pictograms;
- selected PLACE marker switches to the larger white teardrop/pin state while preserving category colour and pictogram;
- changing a category colour updates its markers without changing marker logic;

---

# 31. Implementation order

Recommended order:

1. project skeleton and configuration;
2. SQLite schema + migrations;
3. FastAPI Admin authentication;
4. React full-screen MapLibre map + white header;
5. categories;
6. PLACE/NOTE CRUD;
7. synchronized map/current-view list;
8. filters, virtualization, Show all and Petassos search;
9. image upload;
10. isolated zone module + Admin zone management;
11. shared-map data model and dynamic visibility;
12. shared-map creation + existing-zone selection + stable token;
13. shared-map management + archive/expiry;
14. traveller mobile-first interface;
15. separate geographic search via `geocoder.js`;
16. CSV import;
17. FastAPI serving production React build/uploads;
18. backup/restore documentation;
19. security/functional tests;
20. final UX/CSS refinement and basemap tuning.

Responsive behaviour must be tested throughout development, not added as a final CSS pass.

---

# 32. Non-goals for the first production version

Do not implement unless requirements change:

- arbitrary polygon zones;
- spatial database;
- marker clustering;
- multiple Admin accounts/roles;
- traveller accounts;
- snapshots of place IDs per shared map;
- permanent shared-link deletion UI;
- CSV update/merge of existing places;
- GeoJSON bulk import;
- image object storage;
- offline mode;
- native mobile applications;
- analytics platform;
- complex audit log;
- generic GIS abstraction.

---

# 33. Final implementation principle

This version may become the final production application.

It must therefore be secure, maintainable and visually polished from the start, but **not over-engineered**.

The desired architecture is deliberately small:

> **one React app + one MapLibre map + one FastAPI app + one SQLite database + one uploads directory.**

The main complexity is functional interaction, not infrastructure.

Keep the code easy to read, easy to modify and easy to hand to another developer.

When a choice exists between a clever generalized design and a straightforward solution that satisfies the current requirements, choose the straightforward solution.
