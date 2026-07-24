# ML4EA Security Role Matrix

This matrix describes the enforced portal boundaries during prelaunch. Page
visibility is not an authorization mechanism; protected access is enforced by
Supabase grants, Row Level Security, RPC checks, and private Storage policies.

| Capability | Anonymous | Signed-in participant | Instructor applicant | Approved instructor | Publisher reviewer | Book owner | Delegated administrator | Owner (`yjin@usc.edu`) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Read public portal and AE catalog | Yes | Yes | Yes | Yes | Yes | Dormant | Yes | Yes |
| Download AE notebooks or open the private repository | No | No | No | No | No | Dormant | No | No |
| Read the three selected AE browser previews | No | No | No | No | Yes | Dormant | Yes | Yes |
| Read public discussions | Yes | Yes | Yes | Yes | Yes | Dormant | Yes | Yes |
| Post and report public discussions | No | Yes | Yes | Yes | No role-based grant | Dormant | Yes | Yes |
| Read Teaching Practice discussions | No | No | No | Yes | No | Dormant | Yes | Yes |
| Submit an instructor application | No | Institutional email only | Yes | No resubmission while approved | No role-based grant | Dormant | Yes | Yes |
| Read an instructor application | No | Own record only | Own record only | Own record only | Own record only | Dormant | All records | All records |
| Read protected resource metadata | No | No | No | Published records | No | Dormant | All records | All records |
| Read online manual sections | No | No | No | Yes | Preview only | Dormant | Yes | Yes |
| Download private instructor files | No | No | No | 60-second signed URL | No | Dormant | 60-second signed URL | 60-second signed URL |
| Approve instructor access | No | No | No | No | No | Dormant | Yes | Yes |
| Moderate discussions and edit announcements | No | No | No | No | No | Dormant | Yes | Yes |
| Grant or revoke publisher review | No | No | No | No | No | Dormant | Yes | Yes |
| Appoint or revoke a delegated administrator | No | No | No | No | No | Dormant | No | Yes |

## Identity bindings

- Instructor access requires an approved application for the authenticated
  Supabase user ID and an exact match between the approved email and the
  verified email in the current authentication token.
- Publisher review requires the matching authenticated user ID, exact current
  verified email, active entitlement, and an unexpired review period.
- Publisher review permits an online manual preview and three identified,
  browser-rendered AE examples. It does not permit notebook downloads, private
  repository access, instructor resources, instructor discussions, or
  administrator functions.
- The `book_owner` entitlement type exists but cannot be granted. Its RPC
  rejects activation until a later migration follows written publisher
  permission and an approved purchaser-verification procedure.
- The permanent owner requires the `portal_admins` assignment and the verified
  email `yjin@usc.edu`.
- A delegated administrator requires an owner-created assignment for the
  authenticated user ID, a confirmed account email, and an exact match with the
  appointed email.
- A matching email string alone never grants access.
- Publisher grants, revocations, expiration dates, and target accounts are
  recorded through administrator-only RPCs and the administrator audit log.

## Automated checks

Run a production build followed by:

```bash
npm run security:audit
```

The audit checks the generated static site and probes the live Supabase project
as an anonymous client. GitHub Pages deployment stops when this command fails.
