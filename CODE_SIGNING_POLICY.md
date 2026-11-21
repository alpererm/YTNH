# Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org)

## What is signed

Only the Windows installer (`*-setup.exe`) and the application executable
(`local-notes-todos.exe`) built from this repository are signed. Every signed
file is produced by the automated GitHub Actions workflow in
[`.github/workflows/build.yml`](.github/workflows/build.yml) from the public
source code in this repository. Third-party components are not signed under
this project's certificate.

Each release is signed only after a manual approval by an approver listed below.

## Team roles

YuTaNoHe is maintained by a single developer.

- Committers and reviewers: [alpererm](https://github.com/alpererm)
- Approvers: [alpererm](https://github.com/alpererm) (repository owner)

Changes from anyone outside the team (for example pull requests) are reviewed
by a team member before they are merged. All team members use multi-factor
authentication for GitHub and SignPath.

## Privacy policy

This program will not transfer any information to other networked systems
unless specifically requested by the user or the person installing or
operating it.

In particular:

- Notes, todos and libraries are stored only in local files that the user
  chooses. There is no account, telemetry or automatic update check.
- When the user inserts an image from a web address, the application downloads
  that image from the address the user provided.
- Opening an `http`/`https` link starts the system's default browser.
- On Windows, the installer checks for the Microsoft Edge WebView2 runtime and,
  if it is missing, downloads it from Microsoft. Microsoft's
  [privacy statement](https://privacy.microsoft.com/privacystatement) applies to
  that download and to WebView2.

## Reporting a problem

Report suspicious or incorrectly signed files by opening an issue in this
repository. Abuse of the SignPath Foundation certificate can also be reported
to support@signpath.io.
