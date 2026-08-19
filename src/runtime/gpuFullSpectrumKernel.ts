/**
 * WebGPU f32 full-spectrum/CLV kernel for the 4D double pendulum.
 *
 * It intentionally contains only shader source; dispatch, readback and CPU
 * promotion decisions live in diagnostic-specific modules.
 */
export const WGSL_CLV_KERNEL = /* wgsl */ `
struct Params {
  m1: f32, m2: f32, l1: f32, l2: f32,
  g: f32, damping: f32, dt: f32, renormEvery: f32,
  forwardTransient: f32, window: f32, backwardTransient: f32, seed: f32,
  pad0: f32, pad1: f32, pad2: f32, pad3: f32,
};
struct QrResult {
  aug: array<f32, 20>,
  r: array<f32, 16>,
};

@group(0) @binding(0) var<storage, read_write> data: array<f32>;
@group(0) @binding(1) var<uniform> params: Params;

fn rng(seed: ptr<function, u32>) -> f32 {
  let next = (*seed + 0x6d2b79f5u);
  *seed = next;
  var t = next;
  t = (t ^ (t >> 15u)) * (1u | t);
  t = (t + ((t ^ (t >> 7u)) * (61u | t))) ^ t;
  return f32((t ^ (t >> 14u))) / 4294967296.0;
}

fn rhs4(x: array<f32, 4>) -> array<f32, 4> {
  var out: array<f32, 4>;
  let t1 = x[0];
  let t2 = x[1];
  let w1 = x[2];
  let w2 = x[3];
  let delta = t1 - t2;
  let sinD = sin(delta);
  let cosD = cos(delta);
  let m11 = (params.m1 + params.m2) * params.l1 * params.l1;
  let m22 = params.m2 * params.l2 * params.l2;
  let b = params.m2 * params.l1 * params.l2;
  let m12 = b * cosD;
  let det = m11 * m22 - m12 * m12;
  out[0] = w1;
  out[1] = w2;
  if (abs(det) < 1e-7) {
    out[2] = 0.0;
    out[3] = 0.0;
    return out;
  }
  let f1 = -b * sinD * w2 * w2 - (params.m1 + params.m2) * params.g * params.l1 * sin(t1) - params.damping * w1;
  let f2 = b * sinD * w1 * w1 - params.m2 * params.g * params.l2 * sin(t2) - params.damping * w2;
  out[2] = (m22 * f1 - m12 * f2) / det;
  out[3] = (-m12 * f1 + m11 * f2) / det;
  return out;
}

fn jac4(x: array<f32, 4>) -> array<f32, 16> {
  var jac: array<f32, 16>;
  let t1 = x[0];
  let t2 = x[1];
  let w1 = x[2];
  let w2 = x[3];
  let delta = t1 - t2;
  let sinD = sin(delta);
  let cosD = cos(delta);
  let m11 = (params.m1 + params.m2) * params.l1 * params.l1;
  let m22 = params.m2 * params.l2 * params.l2;
  let b = params.m2 * params.l1 * params.l2;
  let m12 = b * cosD;
  let det = m11 * m22 - m12 * m12;
  jac[0] = 0.0; jac[1] = 0.0; jac[2] = 1.0; jac[3] = 0.0;
  jac[4] = 0.0; jac[5] = 0.0; jac[6] = 0.0; jac[7] = 1.0;
  if (abs(det) < 1e-7) {
    for (var i = 8u; i < 16u; i = i + 1u) {
      jac[i] = 0.0;
    }
    return jac;
  }
  let f1 = -b * sinD * w2 * w2 - (params.m1 + params.m2) * params.g * params.l1 * sin(t1) - params.damping * w1;
  let f2 = b * sinD * w1 * w1 - params.m2 * params.g * params.l2 * sin(t2) - params.damping * w2;
  let n2 = m22 * f1 - m12 * f2;
  let n3 = -m12 * f1 + m11 * f2;
  let det2 = det * det;
  let dm12 = array<f32, 4>(-b * sinD, b * sinD, 0.0, 0.0);
  let ddet = array<f32, 4>(-2.0 * m12 * dm12[0], -2.0 * m12 * dm12[1], 0.0, 0.0);
  let df1 = array<f32, 4>(
    -b * cosD * w2 * w2 - (params.m1 + params.m2) * params.g * params.l1 * cos(t1),
    b * cosD * w2 * w2,
    -params.damping,
    -2.0 * b * sinD * w2
  );
  let df2 = array<f32, 4>(
    b * cosD * w1 * w1,
    -b * cosD * w1 * w1 - params.m2 * params.g * params.l2 * cos(t2),
    2.0 * b * sinD * w1,
    -params.damping
  );
  for (var j = 0u; j < 4u; j = j + 1u) {
    let dn2 = m22 * df1[j] - (dm12[j] * f2 + m12 * df2[j]);
    let dn3 = -(dm12[j] * f1 + m12 * df1[j]) + m11 * df2[j];
    jac[8u + j] = (dn2 * det - n2 * ddet[j]) / det2;
    jac[12u + j] = (dn3 * det - n3 * ddet[j]) / det2;
  }
  return jac;
}

fn add20(a: array<f32, 20>, b: array<f32, 20>, scale: f32) -> array<f32, 20> {
  var out: array<f32, 20>;
  for (var i = 0u; i < 20u; i = i + 1u) {
    out[i] = a[i] + scale * b[i];
  }
  return out;
}

fn rhs_aug(s: array<f32, 20>) -> array<f32, 20> {
  var x = array<f32, 4>(s[0], s[1], s[2], s[3]);
  let fx = rhs4(x);
  let jac = jac4(x);
  var out: array<f32, 20>;
  for (var i = 0u; i < 4u; i = i + 1u) {
    out[i] = fx[i];
  }
  for (var j = 0u; j < 4u; j = j + 1u) {
    let base = 4u + j * 4u;
    for (var r = 0u; r < 4u; r = r + 1u) {
      var acc = 0.0;
      for (var c = 0u; c < 4u; c = c + 1u) {
        acc = acc + jac[r * 4u + c] * s[base + c];
      }
      out[base + r] = acc;
    }
  }
  return out;
}

fn rk4_aug(s: array<f32, 20>, h: f32) -> array<f32, 20> {
  let k1 = rhs_aug(s);
  let k2 = rhs_aug(add20(s, k1, 0.5 * h));
  let k3 = rhs_aug(add20(s, k2, 0.5 * h));
  let k4 = rhs_aug(add20(s, k3, h));
  var out: array<f32, 20>;
  for (var i = 0u; i < 20u; i = i + 1u) {
    out[i] = s[i] + (h / 6.0) * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
  }
  return out;
}

fn qr_decompose(s: array<f32, 20>) -> QrResult {
  var out = s;
  var rmat: array<f32, 16>;
  for (var i = 0u; i < 4u; i = i + 1u) {
    let bi = 4u + i * 4u;
    for (var j = 0u; j < i; j = j + 1u) {
      let bj = 4u + j * 4u;
      var dot = 0.0;
      for (var rr = 0u; rr < 4u; rr = rr + 1u) {
        dot = dot + out[bi + rr] * out[bj + rr];
      }
      rmat[j * 4u + i] = dot;
      for (var rr = 0u; rr < 4u; rr = rr + 1u) {
        out[bi + rr] = out[bi + rr] - dot * out[bj + rr];
      }
    }
    var normSq = 0.0;
    for (var rr = 0u; rr < 4u; rr = rr + 1u) {
      normSq = normSq + out[bi + rr] * out[bi + rr];
    }
    let norm = sqrt(max(normSq, 0.0));
    rmat[i * 4u + i] = norm;
    let inv = select(0.0, 1.0 / norm, norm > 0.0);
    for (var rr = 0u; rr < 4u; rr = rr + 1u) {
      out[bi + rr] = out[bi + rr] * inv;
    }
  }
  return QrResult(out, rmat);
}

fn evolve_interval(s: array<f32, 20>) -> array<f32, 20> {
  var out = s;
  for (var step = 0u; step < u32(params.renormEvery); step = step + 1u) {
    out = rk4_aug(out, params.dt);
  }
  return out;
}

fn normalize_columns(m: array<f32, 16>) -> array<f32, 16> {
  var out = m;
  for (var col = 0u; col < 4u; col = col + 1u) {
    var normSq = 0.0;
    for (var row = 0u; row < 4u; row = row + 1u) {
      let v = out[row * 4u + col];
      normSq = normSq + v * v;
    }
    let norm = sqrt(max(normSq, 0.0));
    let inv = select(0.0, 1.0 / norm, norm > 0.0);
    for (var row = 0u; row < 4u; row = row + 1u) {
      out[row * 4u + col] = out[row * 4u + col] * inv;
    }
  }
  return out;
}

fn solve_upper_triangular(rmat: array<f32, 16>, cmat: array<f32, 16>) -> array<f32, 16> {
  var x: array<f32, 16>;
  for (var col = 0u; col < 4u; col = col + 1u) {
    var ii = 3i;
    loop {
      var acc = cmat[u32(ii) * 4u + col];
      for (var jj = u32(ii + 1); jj < 4u; jj = jj + 1u) {
        acc = acc - rmat[u32(ii) * 4u + jj] * x[jj * 4u + col];
      }
      let diag = rmat[u32(ii) * 4u + u32(ii)];
      x[u32(ii) * 4u + col] = select(0.0, acc / diag, abs(diag) > 1e-20);
      if (ii == 0i) {
        break;
      }
      ii = ii - 1i;
    }
  }
  return x;
}

fn min_hyperbolicity_angle(vectors: array<f32, 16>, exponents: array<f32, 4>, zeroTol: f32) -> f32 {
  var minAngle = 1.57079632679;
  var found = false;
  for (var i = 0u; i < 4u; i = i + 1u) {
    if (exponents[i] <= zeroTol) {
      continue;
    }
    for (var j = 0u; j < 4u; j = j + 1u) {
      if (exponents[j] >= -zeroTol) {
        continue;
      }
      var dot = 0.0;
      for (var r = 0u; r < 4u; r = r + 1u) {
        dot = dot + vectors[i * 4u + r] * vectors[j * 4u + r];
      }
      let angle = acos(clamp(abs(dot), 0.0, 1.0));
      if (angle < minAngle) {
        minAngle = angle;
      }
      found = true;
    }
  }
  return select(-1.0, minAngle, found);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x != 0u) {
    return;
  }
  let window = u32(params.window);
  if (window == 0u || window > 128u || u32(params.backwardTransient) >= window || u32(params.renormEvery) == 0u) {
    data[7] = -1.0;
    return;
  }

  var aug: array<f32, 20>;
  for (var i = 0u; i < 4u; i = i + 1u) {
    aug[i] = data[i];
  }
  var seed = u32(params.seed);
  for (var j = 0u; j < 4u; j = j + 1u) {
    let base = 4u + j * 4u;
    for (var r = 0u; r < 4u; r = r + 1u) {
      aug[base + r] = rng(&seed) - 0.5;
    }
  }
  var qr = qr_decompose(aug);
  aug = qr.aug;

  for (var t = 0u; t < u32(params.forwardTransient); t = t + 1u) {
    aug = evolve_interval(aug);
    qr = qr_decompose(aug);
    aug = qr.aug;
  }

  var frames: array<f32, 2064>;
  var rfactors: array<f32, 2048>;
  for (var q = 0u; q < 16u; q = q + 1u) {
    frames[q] = aug[4u + q];
  }
  var expSum = array<f32, 4>(0.0, 0.0, 0.0, 0.0);
  for (var m = 1u; m <= window; m = m + 1u) {
    aug = evolve_interval(aug);
    qr = qr_decompose(aug);
    aug = qr.aug;
    let ro = (m - 1u) * 16u;
    for (var q = 0u; q < 16u; q = q + 1u) {
      rfactors[ro + q] = qr.r[q];
    }
    let fo = m * 16u;
    for (var q = 0u; q < 16u; q = q + 1u) {
      frames[fo + q] = aug[4u + q];
    }
    for (var j = 0u; j < 4u; j = j + 1u) {
      expSum[j] = expSum[j] + log(max(qr.r[j * 4u + j], 1e-20));
    }
  }

  let intervalTime = params.renormEvery * params.dt;
  let denom = f32(window) * intervalTime;
  var exponents: array<f32, 4>;
  var absMax = 0.0;
  for (var j = 0u; j < 4u; j = j + 1u) {
    exponents[j] = expSum[j] / denom;
    absMax = max(absMax, abs(exponents[j]));
    data[j] = exponents[j];
  }
  let zeroTol = 1e-6 + 0.05 * absMax;

  var coeffs: array<f32, 16>;
  for (var i = 0u; i < 4u; i = i + 1u) {
    coeffs[i * 4u + i] = 1.0;
  }
  coeffs = normalize_columns(coeffs);
  let analysisMax = window - u32(params.backwardTransient);
  var angleSum = 0.0;
  var angleMin = 1.57079632679;
  var angleCount = 0.0;
  var outputVectors: array<f32, 16>;

  var mm = i32(window) - 1i;
  loop {
    if (mm < 0i) {
      break;
    }
    let mu = u32(mm);
    var rmat: array<f32, 16>;
    let ro = mu * 16u;
    for (var q = 0u; q < 16u; q = q + 1u) {
      rmat[q] = rfactors[ro + q];
    }
    coeffs = solve_upper_triangular(rmat, coeffs);
    coeffs = normalize_columns(coeffs);
    if (mu <= analysisMax) {
      var vectors: array<f32, 16>;
      let fo = mu * 16u;
      for (var col = 0u; col < 4u; col = col + 1u) {
        for (var row = 0u; row < 4u; row = row + 1u) {
          var acc = 0.0;
          for (var basis = 0u; basis < 4u; basis = basis + 1u) {
            acc = acc + coeffs[basis * 4u + col] * frames[fo + basis * 4u + row];
          }
          vectors[col * 4u + row] = acc;
        }
        var normSq = 0.0;
        for (var row = 0u; row < 4u; row = row + 1u) {
          let v = vectors[col * 4u + row];
          normSq = normSq + v * v;
        }
        let norm = sqrt(max(normSq, 0.0));
        let inv = select(0.0, 1.0 / norm, norm > 0.0);
        for (var row = 0u; row < 4u; row = row + 1u) {
          vectors[col * 4u + row] = vectors[col * 4u + row] * inv;
        }
      }
      if (mu == 0u) {
        outputVectors = vectors;
      }
      let angle = min_hyperbolicity_angle(vectors, exponents, zeroTol);
      if (angle >= 0.0) {
        angleSum = angleSum + angle;
        angleMin = min(angleMin, angle);
        angleCount = angleCount + 1.0;
      }
    }
    mm = mm - 1i;
  }

  data[4] = select(-1.0, angleSum / angleCount, angleCount > 0.0);
  data[5] = select(-1.0, angleMin, angleCount > 0.0);
  data[6] = angleCount;
  data[7] = 1.0;
  for (var q = 0u; q < 16u; q = q + 1u) {
    data[8u + q] = outputVectors[q];
  }
}
`;
