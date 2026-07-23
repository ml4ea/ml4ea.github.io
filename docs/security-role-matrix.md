# ML4EA Security Role Matrix

This matrix describes the enforced portal boundaries during prelaunch. Page
visibility is not an authorization mechanism; protected access is enforced by
Supabase grants, Row Level Security, RPC checks, and private Storage policies.

| Capability | Anonymous | Signed-in participant | Instructor applicant | Approved instructor | Delegated administrator | Owner (`yjin@usc.edu`) |
| --- | --- | --- | --- | --- | --- | --- |
| Read public portal and AE catalog | Yes | Yes | Yes | Yes | Yes | Yes |
| Download or open AE notebooks | No | No | No | No | No | No |
| Read public discussions | Yes | Yes | Yes | Yes | Yes | Yes |
| Post and report public discussions | No | Yes | Yes | Yes | Yes | Yes |
| Read Teaching Practice discussions | No | No | No | Yes | Yes | Yes |
| Submit an instructor application | No | Institutional email only | Yes | No resubmission while approved | Yes | Yes |
| Read an instructor application | No | Own record only | Own record only | Own record only | All records | All records |
| Read protected resource metadata | No | No | No | Published records | All records | All records |
| Read online manual sections | No | No | No | Yes | Yes | Yes |
| Download private instructor files | No | No | No | 60-second signed URL | 60-second signed URL | 60-second signed URL |
| Approve instructor access | No | No | No | No | Yes | Yes |
| Moderate discussions and edit announcements | No | No | No | No | Yes | Yes |
| Appoint or revoke a delegated administrator | No | No | No | No | No | Yes |

## Identity bindings

- Instructor access requires an approved application for the authenticated
  Supabase user ID and an exact match between the approved email and the
  verified email in the current authentication token.
- The permanent owner requires the `portal_admins` assignment and the verified
  email `yjin@usc.edu`.
- A delegated administrator requires an owner-created assignment for the
  authenticated user ID, a confirmed account email, and an exact match with the
  appointed email.
- A matching email string alone never grants access.

## Automated checks

Run a production build followed by:

```bash
npm run security:audit
```

The audit checks the generated static site and probes the live Supabase project
as an anonymous client. GitHub Pages deployment stops when this command fails.
