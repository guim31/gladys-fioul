# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration needs no account and stores no secret. Under `/data` it keeps
one small file: the last week announced by the scene trigger and the last
address of the ministry's workbook that worked. It only connects to Gladys and
to `www.ecologie.gouv.fr` over HTTPS (the workbook link is followed only on a
`gouv.fr` site), and reads the downloaded workbook with size limits (5 MB
downloaded, 16 MB per inflated part).

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the ministry's website and data.
