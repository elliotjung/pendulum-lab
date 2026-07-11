# Flagship Certification

Generated: 2026-07-10T14:01:10.704Z

Status: **CERTIFIED-WITH-CAVEATS**

Source study: `reports/paper-study.json`

Crossing: `gamma = 0.692973` with localization interval [0.692970, 0.692977].

Figure 1 SVG hash: `07f877d6fdb816`

Figure 1 caption: Figure 1. Quantitative gap map between the analytic Melnikov homoclinic-tangle threshold A_c(gamma) and the measured period-doubling onset A_PD(gamma) of the primary period-1 attractor at omega=2/3. Error bars report the onset-localization contract, the dashed line marks A_PD/A_c=1, and the vertical marker is the interpolated reversal where the cascade begins below the first-order Melnikov prediction.

Reviewer appendix note: The flagship claim is not that Melnikov theory predicts the attractor cascade. It is a measured separation map: A_c is analytic first-order geometry, A_PD is a Floquet-refined attractor-branch instability, and the reported reversal is bounded by the exported caveat map and the independent Python A_PD probes.

## Onset Localization Table

| gamma | A_c | A_PD | ratio | ratio err | rho below | rho above | K below | K above | caveat |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 0.10 | 0.203755 | 0.483984 | 2.375324 | 6.10e-7 | -0.9462 | -1.0518 | 0.020 | 0.998 | none |
| 0.15 | 0.305632 | 0.530802 | 1.736736 | 6.10e-7 | -0.9437 | -1.0562 | 0.018 | 0.997 | none |
| 0.20 | 0.407510 | 0.590045 | 1.447928 | 6.10e-7 | -0.9403 | -1.0605 | 0.021 | -0.013 | post-onset 0-1 sample is not cleanly chaotic at 1.08*A_PD |
| 0.25 | 0.509387 | 0.658288 | 1.292314 | 6.10e-7 | -0.9368 | -1.0646 | -0.020 | 0.999 | none |
| 0.30 | 0.611265 | 0.732944 | 1.199062 | 6.10e-7 | -0.9330 | -1.0674 | 0.017 | 0.057 | post-onset 0-1 sample is not cleanly chaotic at 1.08*A_PD |
| 0.35 | 0.713142 | 0.812174 | 1.138868 | 6.10e-7 | -0.9312 | -1.0708 | -0.019 | 0.998 | none |
| 0.40 | 0.815019 | 0.894700 | 1.097765 | 6.10e-7 | -0.9299 | -1.0729 | 0.019 | -0.013 | post-onset 0-1 sample is not cleanly chaotic at 1.08*A_PD |
| 0.45 | 0.916897 | 0.979636 | 1.068426 | 6.10e-7 | -0.9284 | -1.0733 | -0.020 | -0.013 | post-onset 0-1 sample is not cleanly chaotic at 1.08*A_PD |
| 0.50 | 1.018774 | 1.066373 | 1.046721 | 6.10e-7 | -0.9289 | -1.0742 | -0.019 | 0.998 | none |
| 0.55 | 1.120652 | 1.154485 | 1.030191 | 6.10e-7 | -0.9298 | -1.0740 | -0.020 | 0.998 | none |
| 0.60 | 1.222529 | 1.243682 | 1.017303 | 6.10e-7 | -0.9313 | -1.0734 | -0.014 | 0.998 | none |
| 0.65 | 1.324407 | 1.333771 | 1.007071 | 6.10e-7 | -0.9334 | -1.0724 | 0.022 | -0.013 | post-onset 0-1 sample is not cleanly chaotic at 1.08*A_PD |
| 0.70 | 1.426284 | 1.424635 | 0.998844 | 6.10e-7 | -0.9360 | -1.0711 | 0.020 | -0.566 | post-onset 0-1 sample is not cleanly chaotic at 1.08*A_PD |
| 0.75 | 1.528161 | 1.516220 | 0.992186 | 6.10e-7 | -0.9400 | -1.0705 | 0.020 | 0.131 | post-onset 0-1 sample is not cleanly chaotic at 1.08*A_PD |
| 0.80 | 1.630039 | 1.608533 | 0.986807 | 6.10e-7 | -0.9397 | -1.0649 | 0.020 | 0.999 | none |

## Basin / Transient Caveat Map

- gamma=0.20: post-onset 0-1 sample is not cleanly chaotic at 1.08*A_PD
- gamma=0.30: post-onset 0-1 sample is not cleanly chaotic at 1.08*A_PD
- gamma=0.40: post-onset 0-1 sample is not cleanly chaotic at 1.08*A_PD
- gamma=0.45: post-onset 0-1 sample is not cleanly chaotic at 1.08*A_PD
- gamma=0.65: post-onset 0-1 sample is not cleanly chaotic at 1.08*A_PD
- gamma=0.70: post-onset 0-1 sample is not cleanly chaotic at 1.08*A_PD
- gamma=0.75: post-onset 0-1 sample is not cleanly chaotic at 1.08*A_PD
- Error bars combine attractor-bracket width with the available dt-sensitivity probe; they are a localization contract, not a full Bayesian posterior.
- Basin caveats are inferred from the exported 0-1 strobe probes; they flag multistability/transient-chaos risk but do not replace a full basin scan.

## Reproduce

```bash
npm run paper:study
npm run flagship:certify
npm run flagship:external
```

