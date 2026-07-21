import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

/**
 * Operator-supplied registry credentials for pulling a private image (#99).
 *
 * A Kubernetes image-pull Secret (`kubernetes.io/dockerconfigjson`) authenticates
 * via HTTP Basic — its `auth` field is `base64("<username>:<password>")` — so there
 * is no token-only form. A registry's "API key / PAT / access token" goes in
 * `password`; `username` is the account username (Docker Hub, GHCR) or a fixed
 * sentinel (`AWS` for ECR, `_json_key` / `oauth2accesstoken` for GCP AR). AgDR-0036.
 */
export class ImagePullCredentials {
  @ApiProperty({
    type: String,
    maxLength: 253,
    example: 'ghcr.io',
    description: 'Registry host the credentials authenticate against.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(253)
  registry!: string

  @ApiProperty({
    type: String,
    maxLength: 255,
    example: 'my-org',
    description:
      'Registry username — an account username, or a registry sentinel (e.g. `AWS`, `_json_key`).',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  username!: string

  @ApiProperty({
    type: String,
    format: 'password',
    writeOnly: true,
    maxLength: 4096,
    example: 'ghp_xxxxxxxxxxxxxxxxxxxx',
    description:
      'Password or access token (PAT / API key) — placed in the dockerconfigjson `auth` field.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  password!: string
}
