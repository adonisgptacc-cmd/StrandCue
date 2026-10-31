# StrandCue Public Website Design

## Objective

Publish a small, accessible public website for StrandCue at `https://strandcue.co.za`. The site must give prospective users a clear product overview and provide the stable privacy, support, terms, and account-deletion resources required for Google Play setup and ongoing user support.

The website operator is **Common Sense Inc.** User support and privacy requests go to `support@strandcue.co.za`.

## Scope

The first release contains five public routes:

1. `/` — product overview, current capabilities, privacy posture, and a placeholder for the future Google Play testing or store link.
2. `/privacy` — plain-language privacy notice covering collected data, purposes, service providers, security, retention, user rights, export, deletion, and contact details.
3. `/delete-account` — the preferred in-app deletion instructions plus an email request path for users who cannot access the app.
4. `/support` — common support topics and the public support address.
5. `/terms` — service terms, acceptable use, availability limits, intellectual property, and the cosmetic-record boundary.

The release also includes a branded 404 page, shared navigation and footer, a site-specific favicon, canonical page metadata, Open Graph text metadata, `robots.txt`, and `sitemap.xml`. No social-preview image is required. A Play download button remains visibly unavailable until a real test or production URL exists; the site must not imply that the app is publicly released before that happens.

The site does not include accounts, application data, analytics, advertising, cookies, a database, a contact form, or third-party scripts. It does not collect sensitive information through the website.

## Hosting boundary

The website is a new Cloudflare Worker with static assets, named `strandcue-website`, attached to the apex custom domain `strandcue.co.za`. The existing Android association Worker currently uses the distinct `strandcue.adonisgptacc.workers.dev` hostname, so it does not compete for the apex route. The website is separate from:

- the existing `strandcue` Worker that serves Android App Links and recovery routes at `strandcue.adonisgptacc.workers.dev`; and
- the private `strandcue-account-deletion` scheduled Worker.

Publishing the website must not edit, replace, route over, or delete either existing Worker. The apex-domain DNS and Worker custom-domain association are the only required Cloudflare control-plane changes.

The website source lives in a focused repository directory with static HTML, CSS, and minimal JavaScript only if the responsive navigation requires it. Cloudflare configuration names the static-assets directory and uses the current compatibility date. No secret or environment variable is needed.

## Content and user journeys

### Product overview

The home page describes StrandCue as a private factual hair record. It presents the implemented Phase 1 areas: Hair Passport, chemical services, activities, shelf, tools, history, privacy controls, export, and deletion. Copy must avoid medical, diagnostic, treatment, recommendation, or safety claims. It should state that StrandCue records information supplied by the user and does not diagnose or prescribe.

### Privacy

The privacy notice distinguishes account details, user-entered hair records, operational/security records, and support correspondence. It describes Supabase and Cloudflare as service providers only to the extent supported by the deployed architecture. It explains access, correction, export, deletion, retention, and contact routes without promising unimplemented response times or jurisdictions.

The notice must not claim legal compliance, certifications, encryption properties, data residency, or deletion timing that the project evidence does not establish. The publication date and operator identity appear prominently.

### Account deletion

The primary route is the in-app flow: Settings → Account → Delete account. The page explains that deletion covers the Hair Passport, services, activities, shelf, tools, history, and the Auth identity, while non-personal catalogue facts remain.

Users who cannot access the app may start a request by emailing `support@strandcue.co.za`. The email link uses a prefilled subject only. The page tells users to write from the email address associated with the account and never send a password, recovery code, access token, or exported record. Support must authenticate the request before initiating any privileged action; the website itself never performs deletion.

### Support and terms

Support covers sign-in, email confirmation, recovery, export, deletion, and reporting a security or privacy concern. It directs users to the public support address and sets no unsupported service-level promise.

Terms identify Common Sense Inc. as operator, require lawful adult use, prohibit attempts to access other users' data or disrupt the service, explain that users are responsible for information they enter, and preserve the product's cosmetic-record boundary. The terms must use restrained language and avoid invented addresses, registration numbers, governing-law commitments, warranties, or liability caps until the operator supplies and reviews them.

## Visual and interaction design

The website extends the mobile application's visual system:

- paper `#F7F5EF` background;
- ink `#253A30` text and primary controls;
- sage `#E8EDDF` surfaces;
- accent `#667D49` and error `#8C3B30` where semantically appropriate;
- the `strandcue•` wordmark and “YOUR HAIR RECORD” identifier;
- generous spacing, restrained rounded cards, and clear typographic hierarchy.

The home page uses a product-led editorial composition rather than a generic software template. Supporting pages prioritize readable policy text with a narrow measure, visible section navigation, and clear contact actions. The design uses typography and simple CSS geometry; it needs no stock or generated imagery.

The responsive header exposes all five routes on desktop and a keyboard-operable menu on small screens. The current page is identified visually and programmatically. Every route remains usable at 200% text zoom and from 320 CSS pixels wide without horizontal scrolling.

## Accessibility and privacy requirements

- Semantic landmarks and a logical heading hierarchy on every route.
- A skip link, visible keyboard focus, adequate color contrast, and descriptive link text.
- Touch targets at least 44 CSS pixels where controls are used.
- Respect for `prefers-reduced-motion`; no essential information depends on motion or color.
- No auto-playing media, modal dialogs, consent banner, tracking pixels, remote fonts, or third-party embeds.
- No email address or account identifier is placed in a query string beyond the fixed support recipient and fixed subject in a `mailto:` link.
- Security headers appropriate for a static site, including a restrictive Content Security Policy, MIME sniffing protection, referrer policy, and frame protection.

## Error handling and maintenance

Unknown routes render a useful branded 404 page with links to Home and Support. External email actions remain ordinary links so browsers and assistive technology can expose their destination. If a mail client is unavailable, the address remains visible and copyable.

Policy dates and the future Play link must be explicit content values that can be updated without changing the site architecture. The first release contains no automated publishing from GitHub; deployment is manual and reviewable. A later CI deployment can be designed separately after the launch branch is merged and Cloudflare credentials are scoped.

## Verification and acceptance

Before publication:

1. Validate all HTML and verify that every internal link and route resolves.
2. Verify desktop and mobile layouts, keyboard navigation, focus order, zoom, reduced-motion behavior, and absence of horizontal overflow.
3. Run an automated accessibility check with no serious or critical findings.
4. Confirm no secrets, analytics, cookies, third-party requests, or personal test data are present.
5. Confirm the privacy, support, terms, and deletion pages identify Common Sense Inc. and `support@strandcue.co.za` consistently.
6. Confirm the deletion page contains the in-app route, inaccessible-account email path, identity-verification expectation, and warning against sending credentials.
7. Confirm `support@strandcue.co.za` has working mail DNS and receives a test message before presenting it as an operational support channel.
8. Confirm the existing App Links and scheduled deletion Workers remain unchanged and healthy.
9. Deploy the new Worker, attach `strandcue.co.za`, wait for TLS activation, and verify all five public routes plus the 404 response over HTTPS.
10. Re-run the Android App Links association check after publication to prove the separate website did not affect recovery infrastructure.

Publication is complete only when the custom domain serves the verified build and its privacy and deletion URLs are ready to enter in Play Console.

## Rollback

Each website deployment is an independent Cloudflare Worker version. If the site is defective, roll back `strandcue-website` to its previous version or detach the apex custom domain. Rollback must not touch the existing `strandcue` or `strandcue-account-deletion` Workers. Repository history and the previous deployed version remain available for recovery.
