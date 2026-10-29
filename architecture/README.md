# Petassos Travel Map — proposed architecture

This scheme describes the application specified in [Petassos_Travel_Map_FINAL_Specification_v5.md](../Petassos_Travel_Map_FINAL_Specification_v5.md). It is a design, not a statement that all components are implemented.

```mermaid
flowchart LR
    A[Petassos Admin] -->|Sign in| AU
    T[Traveller] -->|Unique shared URL| TU

    subgraph B[Browser — one React application]
      direction TB
      AU[Admin view / route<br/>Places · Notes · Zones<br/>Categories · Shared maps · CSV]
      TU[Traveller view / route<br/>Authorised places and details]
      MAP[Shared MapLibre map<br/>markers · lists · selection]
      GEO[Geographic search adapter]
      AU --> MAP
      TU --> MAP
      AU --> GEO
      TU --> GEO
    end

    subgraph S[One production service — FastAPI]
      direction TB
      WEB[Serves compiled React app<br/>and uploaded images]
      ADMIN[Admin API<br/>session-protected editing and import]
      PUBLIC[Shared-map API<br/>validates token on every request]
      ZONES[Zone module<br/>rectangles and capabilities]
      RULES[Sharing rules<br/>published + selected zones + allowed categories]
      ADMIN --> ZONES
      PUBLIC --> RULES
      RULES --> ZONES
    end

    subgraph D[Persistent storage]
      DB[(SQLite<br/>places · notes · categories<br/>zones · shared links)]
      FILES[(Uploads directory<br/>place and note images)]
    end

    AU -->|HTTPS + signed session cookie| ADMIN
    TU -->|HTTPS + share token| PUBLIC
    ADMIN --> DB
    ADMIN --> FILES
    ZONES --> DB
    RULES --> DB
    WEB --> FILES
    WEB -->|HTML · CSS · JavaScript| AU
    WEB -->|HTML · CSS · JavaScript| TU

    MAP -->|Basemap tiles| TILES[OpenFreeMap Bright]
    GEO -->|Submitted location search| GEOCODER[Geocoding provider<br/>initially Nominatim / OSM]

    classDef person fill:#fff5dc,stroke:#bc8a35,color:#17324d
    classDef browser fill:#eaf5ff,stroke:#488bc4,color:#17324d
    classDef server fill:#eff8f2,stroke:#47966b,color:#17324d
    classDef data fill:#fff0f4,stroke:#bd6a85,color:#17324d
    classDef external fill:#f4f4f4,stroke:#888,color:#17324d
    class A,T person
    class AU,TU,MAP,GEO browser
    class WEB,ADMIN,PUBLIC,ZONES,RULES server
    class DB,FILES data
    class TILES,GEOCODER external
```

## Main connections

| Connection | Purpose |
| --- | --- |
| Admin browser → Admin API | Manage places, internal notes, categories, zones, shared maps and CSV imports. A signed cookie identifies the shared Admin account. |
| Traveller browser → Shared-map API | Present the unique URL token. FastAPI validates it and returns only authorised published places. |
| Sharing rules → SQLite and zone module | Apply the selected zone IDs and allowed category IDs to the current place data. Changes to qualifying places or zone boundaries affect active shared maps. |
| MapLibre → OpenFreeMap | Load the Bright basemap directly in the browser. |
| Geographic search adapter → provider | Search cities and addresses on explicit user submission; results are separate from Petassos records. |
| FastAPI → SQLite / uploads | Store structured data in one database and image files in one persistent directory. |

In production, **FastAPI serves the compiled React app, API and uploads as one service**. During development, Vite may serve React separately. Admin and traveller views use the same place database and reusable map primitives; the backend is the source of truth for traveller visibility.

## Frontend routes

| URL | View |
| --- | --- |
| `/admin/login` | Admin sign-in |
| `/admin` | Admin map and management views |
| `/s/{token}` | Traveller shared map; no account required |

## API routes

These are the **indicative routes from specification §22**, not an inventory of implemented endpoints. The implementation may merge or simplify them while preserving access control. Every `/api/admin/...` route requires the Admin session, except login. Every `/api/shared/{token}...` request validates the token and applies the backend visibility rules.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/admin/login` | Sign in and create the Admin session |
| `POST` | `/api/admin/logout` | End the Admin session |
| `GET` | `/api/admin/session` | Check the current Admin session |
| `GET` | `/api/admin/places` | Load Admin PLACE and NOTE records |
| `POST` | `/api/admin/places` | Create a PLACE or NOTE |
| `PUT` | `/api/admin/places/{id}` | Update a PLACE or NOTE |
| `DELETE` | `/api/admin/places/{id}` | Delete a PLACE or NOTE |
| `POST` | `/api/admin/places/{id}/images` | Upload an image for a PLACE or NOTE |
| `PUT` | `/api/admin/images/{id}` | Update image information, such as its caption |
| `DELETE` | `/api/admin/images/{id}` | Remove an image |
| `GET` | `/api/admin/categories` | List categories |
| `POST` | `/api/admin/categories` | Create a category |
| `PUT` | `/api/admin/categories/{id}` | Update a category |
| `DELETE` | `/api/admin/categories/{id}` | Delete an unused category |
| `GET` | `/api/admin/zones` | List saved zones |
| `POST` | `/api/admin/zones` | Create a rectangular zone |
| `PUT` | `/api/admin/zones/{id}` | Rename or reshape a zone |
| `DELETE` | `/api/admin/zones/{id}` | Delete an unused zone |
| `GET` | `/api/admin/share-links` | List shared maps |
| `POST` | `/api/admin/share-links` | Create a shared map and stable token |
| `PUT` | `/api/admin/share-links/{id}` | Edit or archive a shared map without changing its token |
| `POST` | `/api/admin/import/places/preview` | Validate a CSV and show row results |
| `POST` | `/api/admin/import/places` | Import valid new PLACE rows |
| `GET` | `/api/shared/{token}` | Read the public map title and allowed settings |
| `GET` | `/api/shared/{token}/places` | Read authorised published PLACEs only |

There is no normal `DELETE` endpoint for shared maps; they are archived through `PUT`. A separate public place-detail route is optional if the authorised place response already contains its details. Unknown tokens return `404`; expired or archived links return `410`.
