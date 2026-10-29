# Oracle Cloud demo

Terraform for the public demo: one Always Free Ampere A1 VM (2 OCPU / 4 GB / 100 GB boot by
default) on Oracle Cloud, ready for `scripts/install.sh`. Works with Terraform or OpenTofu.

Variable validations cap the shape at the Always Free limits (2 OCPU, 12 GB, 200 GB block
storage), so a plan cannot drift into paid compute. Still set a **$1 budget alert** in the
console — validations do not cover resources created outside this module.

## Prerequisites

- The Marsa api/web images must be published for `linux/arm64` (CD builds both architectures).
- An API key in `~/.oci/config` (Profile → API keys → Add API key). Session tokens from
  `oci session authenticate` expire hourly and are a poor fit for Terraform.

## Bring it up

```bash
cd infra/oracle-demo
cp terraform.tfvars.example terraform.tfvars   # fill in
tofu init
tofu apply
```

`Out of host capacity` means the AD has no free A1 hosts right now: set
`availability_domain_index` to another AD, or retry later.

Then:

1. Create the two A records from the `dns_records` output (`<domain>` and `*.<domain>`).
2. Once they resolve, run the `install_command` output. It fetches `scripts/install.sh` at
   `installer_ref` and installs with your domain and email.

## Continuous deploy

Set `cd_deploy_public_key` to the public half of the `CD_SSH_PRIVATE_KEY` secret and cloud-init
installs the forced-command deploy key from AgDR-0028. After `apply`, update the repo secrets:

- `CD_VPS_HOST` → the `public_ip` output
- `CD_SSH_USER` → `root`
- `CD_SSH_KNOWN_HOSTS` → `ssh-keyscan <public_ip>`

## State

State is local and gitignored. It holds no secrets beyond OCIDs and the public IP; keep a copy
if more than one person manages the demo.
