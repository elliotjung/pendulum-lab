# Submission track map

`lastVerified: 2026-07-13`

`staleAfterDays: 30`
`deadlinePolicy: never copy an annual deadline into this file; link the official current call`

This map turns the existing reviewer kit into candidate conference/competition
packages. It does **not** claim that a call is open or that the author is
eligible. Annual dates, school-year rules, consent forms, language, authorship,
mentor, travel, and display requirements are time-varying and must be confirmed
on the official call before any submission.

## Source freshness contract

For each attempt, create a private submission worksheet containing: track,
official call URL, `checkedAt` in ISO date format, eligibility quote or field,
deadline with timezone as shown by the organizer, required files, page/size
limits, consent/mentor requirements, and the reviewer who confirmed it. If this
document's `lastVerified` is older than `staleAfterDays`, or an official URL is
missing/changed, mark the track `stale` and do not rely on the summary below.
Historical news posts prove only that a program existed in that year.

## Candidate tracks

### Korean Physical Society meeting / student-facing opportunity

- **Official sources:** [KPS](https://www.kps.or.kr/) and the
  [KPS Indico meeting index](https://indico.kps.or.kr/). The Indico index is the
  official event surface for divisions, branches, conferences, and seasonal
  schools.
- **Current status:** `eligibility-unverified`. No permanent official page was
  found that guarantees a secondary-school "student session" every year.
  Before planning, ask the listed conference contact whether a high-school
  author may submit directly, must submit through a member/advisor, or should
  use a branch meeting, poster session, or seasonal-school route.
- **Best framing:** a nonlinear/chaotic dynamics poster: analytic Melnikov
  threshold versus Floquet-located period-doubling onset, with independent
  numerical validation and explicit multistability caveats.
- **Package:** Korean/English abstract derived from `paper/paper.pdf`; Figure 1
  from `reports/flagship-figure1.svg`; compact method/uncertainty table from
  `reports/flagship-certification.md`; QR/link to `reviewer.html`; reproducibility
  manifest from `reports/reviewer-kit-manifest.json`.
- **Owner gate:** author + physics teacher/advisor confirm eligibility,
  affiliation wording, coauthor contributions, presentation language, poster
  dimensions, and permission to list school/mentor identity.

### Regeneron ISEF pathway

- **Official sources:** [Find an Affiliated Fair](https://findafair.societyforscience.org/),
  [International Rules](https://www.societyforscience.org/isef/international-rules/),
  and [rules for all projects](https://www.societyforscience.org/isef/international-rules/rules-for-all-projects/).
- **Current status:** `feeder-required`. ISEF is not a direct-upload route; an
  eligible student must advance through an affiliated fair. Use Find a Fair for
  South Korea and confirm the local fair's territory/school rules with its
  director. Rules/forms must be considered from the start of research, not
  reconstructed after selection.
- **Best framing:** computational physics research with a testable question,
  original measurement pipeline, parameter sweep, uncertainty and limitations.
  The project must be presented as research, not merely a software demonstration.
- **Package:** research plan/logbook; `paper/paper.pdf`; display-board figures;
  raw/processed `reports/paper-study.json`; independent checks
  `reports/flagship-external-check.json` and `reports/cross-validation.json`;
  source/release archive; concise video generated separately; reviewer-kit
  manifest as supplementary reproducibility evidence.
- **Owner gate:** student + Adult Sponsor use the current rules wizard/forms and
  obtain any required approval **before** the relevant work. Confirm age/grade,
  project period, AI/tool disclosure, team membership, human/animal/hazard rules,
  display/safety, English abstract/board, and local fair requirements. This
  repository cannot certify eligibility.

### Samsung Junior SW creation competition (historical candidate)

- **Official sources:** Samsung's
  [2021 call announcement](https://news.samsung.com/kr/%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90-2021-%EC%82%BC%EC%84%B1-%EC%A3%BC%EB%8B%88%EC%96%B4-sw-%EC%B0%BD%EC%9E%91%EB%8C%80%ED%9A%8C-%EA%B0%9C%EC%B5%9C)
  and historical program domain <https://www.juniorsoftwarecup.com/>.
- **Current status:** `historical-only-until-new-official-call`. The linked
  announcement is evidence for the 2021 program, not evidence that a current
  competition is open. Do not infer a deadline, eligibility, theme, organizer,
  or prize from it. Search Samsung Newsroom/CSR and the program domain for a new
  official call; if none exists, archive this route rather than using a blog or
  contest aggregator as authority.
- **Best framing if revived:** an accessible "measure local gravity from a real
  pendulum video" learning tool, not the research workbench alone. Demonstrate
  the student problem, user testing, privacy/offline design, and measurable
  educational outcome.
- **Package:** 60-120 second captioned demo; `reports/portfolio-korean.pdf`;
  standalone `index.html`; curriculum map `docs/curriculum-mapping-ko.md`;
  privacy/security note; before/after user feedback; technical appendix linking
  the same reviewer evidence.
- **Owner gate:** confirm that the current call accepts high-school entrants,
  team/advisor structure, software ownership, third-party assets, personal data,
  AI assistance, video consent, judging language, and executable-file policy.

## One source artifact, several submission shapes

| Reviewer-kit source                     | Physics poster               | ISEF-style research package  | SW/portfolio pitch           |
| --------------------------------------- | ---------------------------- | ---------------------------- | ---------------------------- |
| `paper/paper.pdf`                       | primary scientific narrative | research report              | technical appendix           |
| `reports/flagship-figure1.svg`          | headline result              | board result panel           | one proof slide              |
| `reports/flagship-certification.*`      | uncertainty/caveat table     | analysis evidence            | trust claim support          |
| `reports/flagship-external-check.json`  | independent reproduction     | validation appendix          | reviewer link                |
| `reports/reviewer-kit-manifest.*`       | QR supplementary material    | reproducibility inventory    | engineering depth            |
| `reviewer.html`                         | live evidence console        | judge follow-up              | "verify it yourself" CTA     |
| standalone `index.html` / release asset | optional demo                | offline judging fallback     | main interactive deliverable |
| `reports/portfolio-korean.pdf`          | author profile appendix      | student contribution summary | primary Korean portfolio     |
| `docs/curriculum-mapping-ko.md`         | outreach note                | broader impact               | teacher adoption case        |

## Submission freeze checklist

- [ ] The official call and eligibility were rechecked inside the freshness
      window; organizer contact answered any ambiguous student/mentor rule.
- [ ] Tag, paper, DOI/arXiv/public URLs, figures, package name, and test counts
      all refer to one release. No "published" claim is based on a draft.
- [ ] Author contribution, mentor contribution, reused libraries/assets, and AI
      assistance are disclosed according to the current rules.
- [ ] Every headline result has parameters, units, uncertainty/localization,
      reproduce command, hash/source artifact, and caveat.
- [ ] PDF/poster/video were reviewed at final size; Korean/English terminology,
      captions, color contrast, alt/transcript, and QR fallback text were checked.
- [ ] The exact uploaded files and organizer receipt are archived privately with
      checksums; access tokens, personal forms, signatures, and student identifiers
      are not committed to the public repository.
