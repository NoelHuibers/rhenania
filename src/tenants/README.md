# Per-tenant code

This folder is the home for **per-corps customizations** — code that should
only run for a single tenant (currently identified by `tenant.slug` from the
control DB).

Everything *outside* this folder is shared across all tenants.

```
src/
├── app/                       shared routes — same shell for every corps
│   ├── (protected)/           shared app: bestellungen, rechnungen, eloranking, …
│   └── (public)/
│       └── page.tsx           DISPATCHER — picks the right landing page by slug
├── components/                shared UI primitives & feature components
├── server/                    shared business logic, DB, auth, tenant context
└── tenants/                   ← YOU ARE HERE — per-corps overrides
    ├── default/               fallback used by any corps without a custom one
    │   └── landing-page.tsx
    └── rhenania/              custom code for tenant slug "rhenania"
        └── landing-page.tsx
```

## Adding a custom landing page for a new corps

1. Create `src/tenants/<slug>/landing-page.tsx` exporting a default async
   component.
2. Register the slug in [`src/app/(public)/page.tsx`](../app/(public)/page.tsx)
   so the dispatcher routes to it.

If a tenant has no folder here, the dispatcher renders
[`default/landing-page.tsx`](./default/landing-page.tsx).

## What belongs here vs. in `src/components`

| Lives here (`src/tenants/<slug>/`)            | Lives in `src/components` |
|-----------------------------------------------|---------------------------|
| Marketing copy, hero text, photos for one corps | Reusable UI primitives    |
| A landing-page composition unique to one corps  | Building blocks any corps could compose |
| Per-corps brand assets, animations              | Shared feature UI (orders, billing, ELO) |

If a piece of UI is generic enough that two corps would use it as-is, it goes
in `src/components`. If you'd cringe seeing tenant B render it verbatim, it
belongs under that tenant's folder here.
