---
paths:
  - 'apps/api/src/app/**/*.command.ts'
---

# Command DTOs (request input)

A command is the class Nest deserialises the request into. The global `ValidationPipe`
runs `forbidNonWhitelisted: true`, so decorators are not optional.

## Validate at the boundary, not in the use-case

```ts
// WRONG — use-case re-checks what the DTO should have rejected
if (!command.code || command.code.trim() === '') {
  throw new BadRequestException('code is required')
}

// RIGHT — on the command class
@ApiProperty({ type: String, description: 'Temporary code from the GitHub redirect.' })
@IsString()
@IsNotEmpty()
code!: string
```

Why: the pipe rejects it with a 400 before the use-case runs, so the manual check is dead
code that drifts from the real rule.

## Decorate every field — an undecorated one is a 400

```ts
// WRONG — forbidNonWhitelisted strips it, so the request fails
state!: string

// RIGHT
@ApiProperty({ type: String, description: 'Signed CSRF state echoed back by GitHub.' })
@IsString()
@IsUUID()
@IsNotEmpty()
state!: ManifestStateUuid
```

Why: `forbidNonWhitelisted` rejects any property with no validation decorator. The build
and isolated unit tests stay green while every real request returns 400.

## Type uuid fields with the branded alias

Use `ManifestStateUuid` / `AppUuid` rather than bare `string`, paired with `@IsUUID()`.

## Extract magic literals to a co-located constant

```ts
// WRONG
@IsIn(['install'])

// RIGHT — capture-installation.constant.ts
@IsIn([INSTALL_SETUP_ACTION], {
  message: `Unsupported setup_action (expected "${INSTALL_SETUP_ACTION}").`,
})
```

Why: the same literal is needed by the validator, the use-case, and the tests.

## In tests, build commands with the builder

```ts
// WRONG
const command = { installationId: '777', setupAction: 'install' }

// RIGHT
const command = new CaptureInstallationCommandBuilder().withInstallationId('777').build()
```

See `.claude/rules/api/builder.md`.
