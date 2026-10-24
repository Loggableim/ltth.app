# Root output exclusion: CTO source review

Date: 2026-10-09. Base: dae0c71cb03ed869dfe654e2de9cc0ca7d708255.

Independent delegated reviewer: GO for exactly the three-line delta, static inspection only. Local node --check, git diff --check, normalized Shared/candidate equality and unchanged inventory status all passed.

GO for exactly three added lines in scripts/check-i18n-literals.js. Root output/ contains release/review snapshots rather than active website inputs. The normalized root-relative equality/prefix guard excludes output and output/** before recursion. It preserves nested assets/output/**, output-public/** and all existing exception, scratch-directory and translation-marker handling. Explicit --files selection happens after walking, so it cannot reintroduce excluded snapshots.

The Shared checkout is heavily dirty. Only this script delta is transferred; no foreign source changes or generated literal inventory are included. The isolated inventory remains byte-identical. Source comparison normalizes CRLF/LF only and confirms the candidate script equals the CEO's Shared script. Node syntax checking is the local verification; the production generator is not run because it writes the inventory and the isolated checkout lacks app dependencies.

CEO-reported generator evidence, not independently replayed here: before exclusion 9,138 HTML files / 42,200 findings / 21 stale Chatango matches; after exclusion 2,921 HTML files / 13,868 findings / no output paths / zero Chatango matches. The generated approximately 7.5 MB inventory delta was discarded. Historical source, guards and tests remain unchanged.

Music follow-up: CEO reports applying the separately committed rmSync guard and replaying the same three suites, 51/51 PASS in 9.276 seconds. That execution is CEO evidence. The CTO branch retains the patch and static report as a separate source handoff; it does not import the untracked Shared suite wholesale.

This is release hygiene and source-only evidence. It does not establish signed artifacts, package/runtime acceptance or release readiness. Overall release remains red; no publication or new feature work is authorized.
